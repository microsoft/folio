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
import { createMatcher, monotonicTime, raceAgainstDeadline } from './util';
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
  private _reporter: Reporter;
  private _didBegin = false;

  constructor(loader: Loader) {
    this._loader = loader;
    this._reporter = this._createReporter();
  }

  private _createReporter() {
    const reporters: Reporter[] = [];
    const defaultReporters = {
      dot: DotReporter,
      line: LineReporter,
      list: ListReporter,
      json: JSONReporter,
      junit: JUnitReporter,
      null: EmptyReporter,
    };
    for (const r of this._loader.fullConfig().reporter) {
      if (typeof r === 'string') {
        if (r in defaultReporters) {
          reporters.push(new defaultReporters[r]());
        } else {
          const p = path.resolve(process.cwd(), r);
          reporters.push(new (require(p).default)());
        }
      } else if ('name' in r && r.name === 'junit') {
        reporters.push(new JUnitReporter(r));
      } else if ('name' in r && r.name === 'json') {
        reporters.push(new JSONReporter(r));
      } else {
        throw new Error(`Unsupported reporter "${r}"`);
      }
    }
    return new Multiplexer(reporters);
  }

  private _generateTests(runList: RunList, fileSuites: Suite[]) {
    const config = this._loader.fullConfig();
    const grepMatcher = createMatcher(config.grep);
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

    for (const fileSuite of fileSuites) {
      const specs = fileSuite._allSpecs().filter(spec => grepMatcher(spec.fullTitle()));
      for (const spec of specs) {
        if (!hashes.has(spec._testType))
          continue;
        const envs = runList.resolveEnvs(spec._testType);
        const optionsHash = findOptionsHash(envs, spec.parent!);
        const hash = hashes.get(spec._testType);
        for (let i = 0; i < runList.project.repeatEach; ++i) {
          const testVariation: TestVariation = {
            projectName: runList.project.name,
            retries: runList.project.retries,
            outputDir: runList.project.outputDir,
            repeatEachIndex: i,
            runListIndex: runList.index,
            workerHash: `${hash}#run-${runList.index}#options-${optionsHash}#repeat-${i}`,
            variationId: `#run-${runList.index}#repeat-${i}`,
          };
          spec._appendTest(testVariation);
        }
      }
    }
  }

  async run(list: boolean, testFileFilter: string[], projectName?: string): Promise<RunResult> {
    const config = this._loader.fullConfig();
    const globalDeadline = config.globalTimeout ? config.globalTimeout + monotonicTime() : undefined;
    const { result, timedOut } = await raceAgainstDeadline(this._run(list, testFileFilter, projectName), globalDeadline);
    if (timedOut) {
      if (!this._didBegin)
        this._reporter.onBegin(config, new Suite(''));
      this._reporter.onTimeout(config.globalTimeout);
      return 'failed';
    }
    return result;
  }

  async _run(list: boolean, testFileFilter: string[], projectName?: string): Promise<RunResult> {
    const config = this._loader.fullConfig();

    const runLists = this._loader.runLists().filter(runList => {
      return !projectName || runList.project.name === projectName;
    });

    const files = new Map<RunList, string[]>();
    const allTestFiles = new Set<string>();
    for (const runList of runLists) {
      const testDir = runList.project.testDir;
      if (!fs.existsSync(testDir))
        throw new Error(`${testDir} does not exist`);
      if (!fs.statSync(testDir).isDirectory())
        throw new Error(`${testDir} is not a directory`);
      const allFiles = await collectFiles(runList.project.testDir);
      const testFiles = filterFiles(testDir, allFiles, testFileFilter, createMatcher(runList.project.testMatch), createMatcher(runList.project.testIgnore));
      files.set(runList, testFiles);
      testFiles.forEach(file => allTestFiles.add(file));
    }

    if (config.globalSetup)
      await this._loader.loadGlobalHook(config.globalSetup)();
    try {
      for (const file of allTestFiles)
        this._loader.loadTestFile(file);

      const rootSuite = new Suite('');
      for (const fileSuite of this._loader.fileSuites().values())
        rootSuite._addSuite(fileSuite);
      if (config.forbidOnly && rootSuite._hasOnly())
        return 'forbid-only';
      filterOnly(rootSuite);

      const fileSuites = new Map<string, Suite>();
      for (const fileSuite of rootSuite.suites)
        fileSuites.set(fileSuite.file, fileSuite);

      const outputDirs = new Set<string>();
      for (const runList of runLists) {
        const fileSuitesForRunList = files.get(runList).map(file => fileSuites.get(file)).filter(Boolean);
        this._generateTests(runList, fileSuitesForRunList);
        outputDirs.add(runList.project.outputDir);
      }

      const total = rootSuite.totalTestCount();
      if (!total)
        return 'no-tests';

      await Promise.all(Array.from(outputDirs).map(outputDir => removeFolderAsync(outputDir).catch(e => {})));

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
        const jobs = Math.min(config.workers, workers.size);
        const shard = config.shard;
        const shardDetails = shard ? `, shard ${shard.current + 1} of ${shard.total}` : '';
        console.log(`Running ${total} test${total > 1 ? 's' : ''} using ${jobs} worker${jobs > 1 ? 's' : ''}${shardDetails}`);
      }

      this._reporter.onBegin(config, rootSuite);
      this._didBegin = true;
      let hasWorkerErrors = false;
      if (!list) {
        const dispatcher = new Dispatcher(this._loader, rootSuite, this._reporter);
        await Promise.race([dispatcher.run(), sigIntPromise]);
        await dispatcher.stop();
        hasWorkerErrors = dispatcher.hasWorkerErrors();
      }
      this._reporter.onEnd();

      if (sigint)
        return 'sigint';
      return hasWorkerErrors || rootSuite.findSpec(spec => !spec.ok()) ? 'failed' : 'passed';
    } finally {
      if (config.globalTeardown)
        await this._loader.loadGlobalHook(config.globalTeardown)();
    }
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
