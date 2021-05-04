/**
 * Copyright 2019 Google Inc. All rights reserved.
 * Modifications copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import rimraf from 'rimraf';
import * as fs from 'fs';
import * as path from 'path';
import { default as ignore } from 'fstream-ignore';
import { promisify } from 'util';
import { Dispatcher } from './dispatcher';
import { Env, Reporter } from './types';
import { createMatcher, monotonicTime, raceAgainstDeadline, wrapInPromise } from './util';
import { Suite, TestVariation } from './test';
import { Loader, RunList } from './loader';
import { Multiplexer } from './reporters/multiplexer';
import DotReporter from './reporters/dot';
import LineReporter from './reporters/line';
import ListReporter from './reporters/list';
import JSONReporter from './reporters/json';
import JUnitReporter from './reporters/junit';
import EmptyReporter from './reporters/empty';

const removeFolderAsync = promisify(rimraf);

type RunResult = 'passed' | 'failed' | 'sigint' | 'forbid-only' | 'no-tests' | 'timedout';

export class Runner {
  private _loader: Loader;

  constructor(loader: Loader) {
    this._loader = loader;
  }

  private _createReporter(runList: RunList) {
    const reporters: Reporter[] = [];
    const configReporters = runList.config.reporter;
    for (const r of Array.isArray(configReporters) ? configReporters : [configReporters]) {
      if (r === 'dot')
        reporters.push(new DotReporter());
      else if (r === 'line')
        reporters.push(new LineReporter());
      else if (r === 'list')
        reporters.push(new ListReporter());
      else if (r === 'json')
        reporters.push(new JSONReporter());
      else if (r === 'junit')
        reporters.push(new JUnitReporter());
      else if (r === 'null')
        reporters.push(new EmptyReporter());
      else if ('name' in r && r.name === 'junit')
        reporters.push(new JUnitReporter(r));
      else if ('name' in r && r.name === 'json')
        reporters.push(new JSONReporter(r));
      else
        reporters.push(r);
    }
    return new Multiplexer(reporters);
  }

  private _generateTests(runList: RunList, fileSuites: Suite[]): Suite {
    const rootSuite = new Suite('');
    const grepMatcher = createMatcher(runList.config.grep);
    const hashes = runList.hashTestTypes();

    // Options that are used in beforeAll produce a new worker.
    const optionsHashMap = new Map<Suite, string>();
    const findOptionsHash = (envs: Env[], suite: Suite | undefined): string => {
      if (!suite)
        return '';

      let hasBeforeAllOptions = false;
      if (suite._options) {
        for (const env of envs) {
          if (env.hasBeforeAllOptions)
            hasBeforeAllOptions = hasBeforeAllOptions || env.hasBeforeAllOptions(suite._options);
        }
      }
      if (!hasBeforeAllOptions)
        return findOptionsHash(envs, suite.parent);

      if (!optionsHashMap.has(suite)) {
        const hash = String(optionsHashMap.size);
        optionsHashMap.set(suite, hash);
        return hash;
      }
      return optionsHashMap.get(suite);
    };

    for (let i = 0; i < runList.config.repeatEach; ++i) {
      for (const fileSuite of fileSuites) {
        const suite = fileSuite._clone();
        const specs = suite._allSpecs().filter(spec => grepMatcher(spec.fullTitle()));
        let suiteHasTests = false;
        for (const spec of specs) {
          if (!hashes.has(spec._testType))
            continue;
          const envs = runList.resolveEnvs(spec._testType);
          const optionsHash = findOptionsHash(envs, spec.parent!);
          const hash = hashes.get(spec._testType);
          const testVariation: TestVariation = {
            tags: runList.tags,
            retries: runList.config.retries,
            outputDir: runList.config.outputDir,
            repeatEachIndex: i,
            runListIndex: runList.index,
            workerHash: `${hash}#options-${optionsHash}#repeat-${i}`,
            variationId: `#run-${runList.index}#repeat-${i}`,
          };
          spec._appendTest(testVariation);
          suiteHasTests = true;
        }
        if (suiteHasTests)
          rootSuite._addSuite(suite);
      }
    }
    return rootSuite;
  }

  async run(list: boolean, testFileFilter: string[], tagFilter?: string[]): Promise<RunResult> {
    const runLists = this._loader.runLists().filter(runList => {
      return !tagFilter || runList.tags.some(tag => tagFilter.includes(tag));
    });

    const files = new Map<RunList, string[]>();
    const allTestFiles = new Set<string>();
    for (const runList of runLists) {
      const testDir = runList.config.testDir;
      if (!fs.existsSync(testDir))
        throw new Error(`${testDir} does not exist`);
      if (!fs.statSync(testDir).isDirectory())
        throw new Error(`${testDir} is not a directory`);
      const allFiles = await collectFiles(runList.config.testDir);
      const testFiles = filterFiles(testDir, allFiles, testFileFilter, createMatcher(runList.config.testMatch), createMatcher(runList.config.testIgnore));
      files.set(runList, testFiles);
      testFiles.forEach(file => allTestFiles.add(file));
    }

    let globalSetupCounter = 0;
    try {
      for (const runList of runLists) {
        if (!await this._runGlobalHook(runList.config.globalSetup, runList.config.globalTimeout, 'global setup'))
          return 'failed';
        globalSetupCounter++;
      }

      for (const file of allTestFiles)
        this._loader.loadTestFile(file);

      const rootSuite = new Suite('');
      for (const fileSuite of this._loader.fileSuites().values())
        rootSuite._addSuite(fileSuite);
      filterOnly(rootSuite);
      const fileSuites = new Map<string, Suite>();
      for (const fileSuite of rootSuite.suites)
        fileSuites.set(fileSuite.file, fileSuite);

      const suites = new Map<RunList, Suite>();
      const outputDirs = new Set<string>();
      for (const runList of runLists) {
        const fileSuitesForRunList = files.get(runList).map(file => fileSuites.get(file)).filter(Boolean);
        const suite = this._generateTests(runList, fileSuitesForRunList);
        if (runList.config.forbidOnly && suite._hasOnly())
          return 'forbid-only';
        if (suite.totalTestCount()) {
          suites.set(runList, suite);
          outputDirs.add(runList.config.outputDir);
        }
      }
      if (!suites.size)
        return 'no-tests';

      await Promise.all(Array.from(outputDirs).map(outputDir => removeFolderAsync(outputDir).catch(e => {})));

      let hasFailures = false;
      for (const [runList, suite] of suites) {
        const reporter = this._createReporter(runList);
        const globalDeadline = runList.config.globalTimeout ? runList.config.globalTimeout + monotonicTime() : undefined;
        const { result, timedOut } = await raceAgainstDeadline(this._runSection(runList, reporter, list, suite), globalDeadline);
        if (timedOut) {
          reporter.onTimeout(runList.config.globalTimeout);
          return 'failed';
        }
        if (result === 'sigint')
          return 'sigint';
        if (result === 'failed')
          hasFailures = true;
      }
      return hasFailures ? 'failed' : 'passed';
    } finally {
      let teardownSuccess = true;
      for (let index = globalSetupCounter - 1; index >= 0; index--) {
        if (!await this._runGlobalHook(runLists[index].config.globalTeardown, runLists[index].config.globalTimeout, 'global teardown'))
          teardownSuccess = false;
      }
      if (!teardownSuccess)
        return 'failed';
    }
  }

  private async _runGlobalHook(file: string | null, timeout: number, title: string) {
    if (!file)
      return true;
    const hook = this._loader.loadGlobalHook(file);
    const globalSetupDeadline = timeout ? timeout + monotonicTime() : undefined;
    const { timedOut } = await raceAgainstDeadline(wrapInPromise(hook()), globalSetupDeadline);
    if (timedOut) {
      if (process.stdout.isTTY)
        console.log(`Timed out waiting ${timeout / 1000}s for the ${title}`);
      return false;
    }
    return true;
  }

  private async _runSection(runList: RunList, reporter: Reporter, list: boolean, rootSuite: Suite): Promise<'passed' | 'failed' | 'sigint'> {
    const total = rootSuite.totalTestCount();

    let sigint = false;
    let sigintCallback: () => void;
    const sigIntPromise = new Promise<void>(f => sigintCallback = f);
    const sigintHandler = () => {
      process.off('SIGINT', sigintHandler);
      sigint = true;
      sigintCallback();
    };
    process.on('SIGINT', sigintHandler);

    if (process.stdout.isTTY) {
      const workers = new Set();
      rootSuite.findTest(test => {
        workers.add(test.spec.file + test._variation.workerHash);
      });
      console.log();
      const jobs = Math.min(runList.config.workers, workers.size);
      const shard = runList.config.shard;
      const shardDetails = shard ? `, shard ${shard.current + 1} of ${shard.total}` : '';
      console.log(`Running ${total} test${total > 1 ? 's' : ''} using ${jobs} worker${jobs > 1 ? 's' : ''}${shardDetails}`);
    }

    reporter.onBegin(runList.config, rootSuite);
    let hasWorkerErrors = false;
    if (!list) {
      const dispatcher = new Dispatcher(this._loader, rootSuite, reporter, runList);
      await Promise.race([dispatcher.run(), sigIntPromise]);
      await dispatcher.stop();
      hasWorkerErrors = dispatcher.hasWorkerErrors();
    }
    reporter.onEnd();

    if (sigint)
      return 'sigint';
    return hasWorkerErrors || rootSuite.findSpec(spec => !spec.ok()) ? 'failed' : 'passed';
  }
}

function filterOnly(suite: Suite) {
  const onlySuites = suite.suites.filter(child => filterOnly(child) || child._only);
  const onlyTests = suite.specs.filter(spec => spec._only);
  const onlyEntries = new Set([...onlySuites, ...onlyTests]);
  if (onlyEntries.size) {
    suite.suites = onlySuites;
    suite.specs = onlyTests;
    suite._entries = suite._entries.filter(e => onlyEntries.has(e)); // Preserve the order.
    return true;
  }
  return false;
}

async function collectFiles(testDir: string): Promise<string[]> {
  const entries: any[] = [];
  let callback = () => {};
  const promise = new Promise<void>(f => callback = f);
  ignore({ path: testDir, ignoreFiles: ['.gitignore'] })
      .on('child', (entry: any) => entries.push(entry))
      .on('end', callback);
  await promise;
  return entries.filter(e => e.type === 'File').sort((a, b) => {
    if (a.depth !== b.depth && (a.dirname.startsWith(b.dirname) || b.dirname.startsWith(a.dirname)))
      return a.depth - b.depth;
    return a.path > b.path ? 1 : (a.path < b.path ? -1 : 0);
  }).map(e => e.path);
}

function filterFiles(base: string, files: string[], filters: string[], filesMatch: (value: string) => boolean, filesIgnore: (value: string) => boolean): string[] {
  return files.filter(file => {
    file = path.relative(base, file);
    if (filesIgnore(file))
      return false;
    if (!filesMatch(file))
      return false;
    if (filters.length && !filters.find(filter => file.includes(filter)))
      return false;
    return true;
  });
}
