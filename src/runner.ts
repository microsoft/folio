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
import { Loader } from './loader';
import { Multiplexer } from './reporters/multiplexer';
import { RunList, TestTypeImpl } from './testType';
import DotReporter from './reporters/dot';
import LineReporter from './reporters/line';
import ListReporter from './reporters/list';
import JSONReporter from './reporters/json';
import JUnitReporter from './reporters/junit';
import EmptyReporter from './reporters/empty';

const removeFolderAsync = promisify(rimraf);

type RunResult = 'passed' | 'failed' | 'sigint' | 'forbid-only' | 'no-tests';

export class Runner {
  private _reporter: Reporter;
  private _loader: Loader;
  private _didBegin = false;

  constructor(loader: Loader) {
    this._loader = loader;

    const reporters: Reporter[] = [];
    const configReporters = loader.config().reporter;
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
    this._reporter = new Multiplexer(reporters);
  }

  private _loadSuite(testFiles: Map<RunList, string[]>, tagFilter?: string[]): Suite {
    const rootSuite = new Suite('');
    const grepMatcher = createMatcher(this._loader.config().grep);

    const testTypeToRuns = new Map<TestTypeImpl, { runList: RunList, hash: string }[]>();
    for (const runList of this._loader.runLists()) {
      if (tagFilter && !runList.tags.some(tag => tagFilter.includes(tag)))
        continue;
      for (const file of testFiles.get(runList)!)
        this._loader.loadTestFile(file);
      for (const [testType, hash] of runList.hashTestTypes()) {
        const hashWithRunListIndex = `#list-${runList.index}#env-${hash}`;
        let list = testTypeToRuns.get(testType);
        if (!list) {
          list = [];
          testTypeToRuns.set(testType, list);
        }
        list.push({ runList, hash: hashWithRunListIndex });
      }
    }

    const fileSets = new Map<RunList, Set<string>>();
    for (const [runList, files] of testFiles)
      fileSets.set(runList, new Set(files));

    // This makes sure we don't generate 1000000 tests if only one spec is focused.
    const filtered = new Set<Suite>();
    for (const fileSuite of this._loader.fileSuites().values()) {
      if (fileSuite._hasOnly())
        filtered.add(fileSuite);
    }

    // Options that are used in beforeAll produce a new worker.
    const findOptionsHash = (map: Map<Suite, string>, envs: Env[], suite: Suite): string => {
      if (!suite.parent)
        return '';

      let hasBeforeAllOptions = false;
      if (suite._options) {
        for (const env of envs) {
          if (env.hasBeforeAllOptions)
            hasBeforeAllOptions = hasBeforeAllOptions || env.hasBeforeAllOptions(suite._options);
        }
      }
      if (!hasBeforeAllOptions)
        return findOptionsHash(map, envs, suite.parent);

      if (!map.has(suite)) {
        const hash = String(map.size);
        map.set(suite, hash);
        return hash;
      }
      return map.get(suite);
    };
    const runListToSuiteOptionsHash = new Map<RunList, Map<Suite, string>>();

    for (const [file, fileSuite] of this._loader.fileSuites()) {
      if (filtered.size && !filtered.has(fileSuite))
        continue;
      const specs = fileSuite._allSpecs().filter(spec => grepMatcher(spec.fullTitle()));
      let suiteHasTests = false;
      for (const spec of specs) {
        for (const { runList, hash } of testTypeToRuns.get(spec._testType) || []) {
          if (!fileSets.get(runList)!.has(file))
            continue;

          let optionsHashMap = runListToSuiteOptionsHash.get(runList);
          if (!optionsHashMap) {
            optionsHashMap = new Map();
            runListToSuiteOptionsHash.set(runList, optionsHashMap);
          }
          const envs = runList.resolveEnvs(spec._testType);
          const optionsHash = findOptionsHash(optionsHashMap, envs, spec.parent!);

          const config = this._loader.config(runList);
          for (let i = 0; i < config.repeatEach; ++i) {
            const testVariation: TestVariation = {
              tags: runList.tags,
              retries: config.retries,
              outputDir: config.outputDir,
              repeatEachIndex: i,
              runListIndex: runList.index,
              workerHash: `${hash}#options-${optionsHash}#repeat-${i}`,
              variationId: `#run-${runList.index}#repeat-${i}`,
            };
            spec._appendTest(testVariation);
            suiteHasTests = true;
          }
        }
      }
      if (suiteHasTests)
        rootSuite._addSuite(fileSuite);
    }
    filterOnly(rootSuite);
    return rootSuite;
  }

  async run(list: boolean, testFileFilter: string[], tagFilter?: string[]): Promise<RunResult> {
    const globalDeadline = this._loader.config().globalTimeout ? this._loader.config().globalTimeout + monotonicTime() : undefined;
    const { result, timedOut } = await raceAgainstDeadline(this._run(list, testFileFilter, tagFilter), globalDeadline);
    if (timedOut) {
      if (!this._didBegin)
        this._reporter.onBegin(this._loader.config(), new Suite(''));
      this._reporter.onTimeout(this._loader.config().globalTimeout);
      process.exit(1);
    }
    return result;
  }

  private async _run(list: boolean, testFileFilter: string[], tagFilter?: string[]): Promise<RunResult> {
    const files = new Map<RunList, string[]>();
    for (const runList of this._loader.runLists()) {
      const config = this._loader.config(runList);
      const testDir = config.testDir;
      if (!fs.existsSync(testDir))
        throw new Error(`${testDir} does not exist`);
      if (!fs.statSync(testDir).isDirectory())
        throw new Error(`${testDir} is not a directory`);
      const allFiles = await collectFiles(testDir);
      const testFiles = filterFiles(testDir, allFiles, testFileFilter, createMatcher(config.testMatch), createMatcher(config.testIgnore));
      files.set(runList, testFiles);
    }

    for (const globalSetup of this._loader.globalSetups())
      await globalSetup();

    const rootSuite = this._loadSuite(files, tagFilter);

    if (this._loader.config().forbidOnly) {
      const hasOnly = rootSuite.findSpec(t => t._only) || rootSuite.findSuite(s => s._only);
      if (hasOnly)
        return 'forbid-only';
    }

    const outputDirs = new Set<string>();
    rootSuite.findTest(test => {
      outputDirs.add(test._variation.outputDir);
    });
    await Promise.all(Array.from(outputDirs).map(outputDir => removeFolderAsync(outputDir).catch(e => {})));

    const total = rootSuite.totalTestCount();
    if (!total)
      return 'no-tests';

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
      const jobs = Math.min(this._loader.config().workers, workers.size);
      const shard = this._loader.config().shard;
      const shardDetails = shard ? `, shard ${shard.current + 1} of ${shard.total}` : '';
      console.log(`Running ${total} test${total > 1 ? 's' : ''} using ${jobs} worker${jobs > 1 ? 's' : ''}${shardDetails}`);
    }

    this._reporter.onBegin(this._loader.config(), rootSuite);
    this._didBegin = true;
    let hasWorkerErrors = false;
    if (!list) {
      const dispatcher = new Dispatcher(this._loader, rootSuite, this._reporter);
      await Promise.race([dispatcher.run(), sigIntPromise]);
      await dispatcher.stop();
      hasWorkerErrors = dispatcher.hasWorkerErrors();
    }
    this._reporter.onEnd();

    for (const globalTeardown of this._loader.globalTeardowns())
      await globalTeardown();
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
