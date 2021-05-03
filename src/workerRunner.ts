/**
 * Copyright Microsoft Corporation. All rights reserved.
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

import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import { mergeObjects, monotonicTime, DeadlineRunner, raceAgainstDeadline, serializeError } from './util';
import { TestBeginPayload, TestEndPayload, RunPayload, TestEntry, DonePayload, WorkerInitParams } from './ipc';
import { setCurrentTestInfo } from './globals';
import { Loader } from './loader';
import { Spec, Suite, Test, TestVariation } from './test';
import { Env, FullConfig, TestInfo, WorkerInfo } from './types';
import { RunList } from './testType';

export class WorkerRunner extends EventEmitter {
  private _params: WorkerInitParams;
  private _loader: Loader;
  private _runList: RunList;
  private _envRunner: EnvRunner;
  private _outputPathSegment: string;
  private _workerInfo: WorkerInfo;
  private _envInitialized = false;
  private _workerArgs: any;

  private _failedTestId: string | undefined;
  private _fatalError: any | undefined;
  private _entries: Map<string, TestEntry>;
  private _remaining: Map<string, TestEntry>;
  private _isStopped: any;
  _currentTest: { testId: string, testInfo: TestInfo } | null = null;
  private _file: string;
  private _config: FullConfig;

  constructor(params: WorkerInitParams) {
    super();
    this._params = params;
  }

  stop() {
    this._isStopped = true;
    this._setCurrentTest(null);
    if (this._envRunner)
      this._envRunner.stop();
  }

  async cleanup() {
    if (!this._envInitialized)
      return;
    this._envInitialized = false;
    // TODO: separate timeout for afterAll?
    const result = await raceAgainstDeadline(this._envRunner.runAfterAll(), this._deadline());
    if (result.timedOut)
      throw new Error(`Timeout of ${this._config.timeout}ms exceeded while shutting down environment`);
  }

  unhandledError(error: Error | any) {
    if (this._isStopped)
      return;
    if (this._currentTest) {
      this._currentTest.testInfo.status = 'failed';
      this._currentTest.testInfo.error = serializeError(error);
      this._failedTestId = this._currentTest.testId;
      this.emit('testEnd', buildTestEndPayload(this._currentTest.testId, this._currentTest.testInfo));
    } else {
      // No current test - fatal error.
      this._fatalError = serializeError(error);
    }
    this._reportDoneAndStop();
  }

  private _deadline() {
    return this._config.timeout ? monotonicTime() + this._config.timeout : undefined;
  }

  private _loadIfNeeded() {
    if (this._loader)
      return;

    this._loader = new Loader();
    this._loader.deserialize(this._params.loader);
    this._runList = this._loader.runLists()[this._params.runListIndex];

    const tags = this._runList.tags.join('-');
    const sameTags = this._loader.runLists().filter(runList => runList.tags.join('-') === tags);
    if (sameTags.length > 1)
      this._outputPathSegment = tags + (sameTags.indexOf(this._runList) + 1);
    else
      this._outputPathSegment = tags;
    if (this._outputPathSegment)
      this._outputPathSegment = '-' + this._outputPathSegment;

    this._config = this._loader.config(this._runList);
    this._workerInfo = {
      workerIndex: this._params.workerIndex,
      config: { ...this._config },
    };
  }

  private async _initEnvIfNeeded(envs: Env<any>[], workerOptions: any) {
    if (this._envRunner) {
      // We rely on the fact that worker only receives tests where
      // environments with beforeAll/afterAll are the prefix of env list.
      // In addition, all the tests should have the same workerOptions.
      this._envRunner.update(envs);
      return;
    }

    this._envRunner = new EnvRunner(envs);
    // TODO: separate timeout for beforeAll?
    const result = await raceAgainstDeadline(this._envRunner.runBeforeAll(this._workerInfo, workerOptions), this._deadline());
    this._workerArgs = result.result;
    if (result.timedOut) {
      this._fatalError = serializeError(new Error(`Timeout of ${this._config.timeout}ms exceeded while initializing environment`));
      this._reportDoneAndStop();
    }
    this._envInitialized = true;
  }

  async run(runPayload: RunPayload) {
    this._file = runPayload.file;
    this._entries = new Map(runPayload.entries.map(e => [ e.testId, e ]));
    this._remaining = new Map(runPayload.entries.map(e => [ e.testId, e ]));

    this._loadIfNeeded();
    const fileSuite = this._loader.loadTestFile(this._file);
    let anySpec: Spec | undefined;
    fileSuite.findSpec(spec => {
      const testVariation: TestVariation = {
        tags: this._runList.tags,
        retries: this._config.retries,
        outputDir: this._config.outputDir,
        repeatEachIndex: this._params.repeatEachIndex,
        runListIndex: this._runList.index,
        workerHash: `does-not-matter`,
        variationId: `#run-${this._runList.index}#repeat-${this._params.repeatEachIndex}`,
      };
      const test = spec._appendTest(testVariation);
      if (this._entries.has(test._id))
        anySpec = spec;
    });
    if (!anySpec) {
      this._reportDone();
      return;
    }

    // Initialize environments' beforeAll.
    await this._initEnvIfNeeded(this._runList.resolveEnvs(anySpec._testType), this._specOptions(anySpec));
    if (this._isStopped)
      return;

    await this._runSuite(fileSuite);
    if (this._isStopped)
      return;

    this._reportDone();
  }

  private async _runSuite(suite: Suite) {
    if (this._isStopped)
      return;
    const skipHooks = !this._hasTestsToRun(suite);
    for (const hook of suite._hooks) {
      if (hook.type !== 'beforeAll' || skipHooks)
        continue;
      if (this._isStopped)
        return;
      // TODO: separate timeout for beforeAll?
      const result = await raceAgainstDeadline(wrapInPromise(hook.fn(this._workerArgs, this._workerInfo)), this._deadline());
      if (result.timedOut) {
        this._fatalError = serializeError(new Error(`Timeout of ${this._config.timeout}ms exceeded while running beforeAll hook`));
        this._reportDoneAndStop();
      }
    }
    for (const entry of suite._entries) {
      if (entry instanceof Suite)
        await this._runSuite(entry);
      else
        await this._runSpec(entry);
    }
    for (const hook of suite._hooks) {
      if (hook.type !== 'afterAll' || skipHooks)
        continue;
      if (this._isStopped)
        return;
      // TODO: separate timeout for afterAll?
      const result = await raceAgainstDeadline(wrapInPromise(hook.fn(this._workerArgs, this._workerInfo)), this._deadline());
      if (result.timedOut) {
        this._fatalError = serializeError(new Error(`Timeout of ${this._config.timeout}ms exceeded while running afterAll hook`));
        this._reportDoneAndStop();
      }
    }
  }

  private async _runSpec(spec: Spec) {
    if (this._isStopped)
      return;
    const test = spec.tests[0];
    const entry = this._entries.get(test._id);
    if (!entry)
      return;
    this._remaining.delete(test._id);

    const startTime = monotonicTime();
    let deadlineRunner: DeadlineRunner<any> | undefined;

    const config = this._workerInfo.config;
    const relativePath = path.relative(config.testDir, spec.file.replace(/\.(spec|test)\.(js|ts)/, ''));
    const sanitizedTitle = spec.title.replace(/[^\w\d]+/g, '-');
    const relativeTestPath = path.join(relativePath, sanitizedTitle);
    const testId = test._id;
    const baseOutputDir = (() => {
      let suffix = this._outputPathSegment;
      if (entry.retry)
        suffix += '-retry' + entry.retry;
      if (this._params.repeatEachIndex)
        suffix += '-repeat' + this._params.repeatEachIndex;
      return path.join(config.outputDir, relativeTestPath + suffix);
    })();
    const testInfo: TestInfo = {
      ...this._workerInfo,
      title: spec.title,
      file: spec.file,
      line: spec.line,
      column: spec.column,
      fn: spec.fn,
      repeatEachIndex: this._params.repeatEachIndex,
      retry: entry.retry,
      expectedStatus: 'passed',
      annotations: [],
      duration: 0,
      status: 'passed',
      stdout: [],
      stderr: [],
      timeout: this._config.timeout,
      data: {},
      snapshotPathSegment: '',
      outputDir: baseOutputDir,
      outputPath: (...pathSegments: string[]): string => {
        fs.mkdirSync(baseOutputDir, { recursive: true });
        return path.join(baseOutputDir, ...pathSegments);
      },
      snapshotPath: (...pathSegments: string[]): string => {
        const basePath = path.join(config.testDir, config.snapshotDir, relativeTestPath, testInfo.snapshotPathSegment);
        return path.join(basePath, ...pathSegments);
      },
      skip: (arg?: boolean | string | Function, description?: string) => modifier(testInfo, 'skip', arg, description),
      fixme: (arg?: boolean | string | Function, description?: string) => modifier(testInfo, 'fixme', arg, description),
      fail: (arg?: boolean | string | Function, description?: string) => modifier(testInfo, 'fail', arg, description),
      slow: (arg?: boolean | string | Function, description?: string) => modifier(testInfo, 'slow', arg, description),
      setTimeout: (timeout: number) => {
        testInfo.timeout = timeout;
        if (deadlineRunner)
          deadlineRunner.setDeadline(deadline());
      },
    };
    this._setCurrentTest({ testInfo, testId });
    const deadline = () => {
      return testInfo.timeout ? startTime + testInfo.timeout : undefined;
    };

    this.emit('testBegin', buildTestBeginPayload(testId, testInfo));

    if (testInfo.expectedStatus === 'skipped') {
      testInfo.status = 'skipped';
      this.emit('testEnd', buildTestEndPayload(testId, testInfo));
      return;
    }

    // Update the list of environment - it may differ between tests, but only
    // by environments without beforeAll/afterAll, so we don't have to
    // reinitialize the worker.
    this._envRunner.update(this._runList.resolveEnvs(spec._testType));

    deadlineRunner = new DeadlineRunner(this._runEnvBeforeEach(testInfo, this._specOptions(spec)), deadline());
    const testArgsResult = await deadlineRunner.result;
    if (testArgsResult.timedOut && testInfo.status === 'passed')
      testInfo.status = 'timedOut';
    if (this._isStopped)
      return;

    const testArgs = testArgsResult.result;
    // Do not run test/teardown if we failed to initialize.
    if (testArgs !== undefined) {
      testInfo[kTestArgsSymbol] = testArgs;  // Save args for modifiers.
      deadlineRunner = new DeadlineRunner(this._runTestWithBeforeHooks(test, testInfo, testArgs), deadline());
      const result = await deadlineRunner.result;
      // Do not overwrite test failure upon hook timeout.
      if (result.timedOut && testInfo.status === 'passed')
        testInfo.status = 'timedOut';
      if (this._isStopped)
        return;

      if (!result.timedOut) {
        deadlineRunner = new DeadlineRunner(this._runAfterHooks(test, testInfo, testArgs), deadline());
        deadlineRunner.setDeadline(deadline());
        const hooksResult = await deadlineRunner.result;
        // Do not overwrite test failure upon hook timeout.
        if (hooksResult.timedOut && testInfo.status === 'passed')
          testInfo.status = 'timedOut';
      } else {
        // A timed-out test gets a full additional timeout to run after hooks.
        const newDeadline = this._deadline();
        deadlineRunner = new DeadlineRunner(this._runAfterHooks(test, testInfo, testArgs), newDeadline);
        await deadlineRunner.result;
      }
    }
    if (this._isStopped)
      return;

    testInfo.duration = monotonicTime() - startTime;
    this.emit('testEnd', buildTestEndPayload(testId, testInfo));
    if (testInfo.status !== 'passed') {
      this._failedTestId = testId;
      this._reportDoneAndStop();
    }
    this._setCurrentTest(null);
  }

  private _setCurrentTest(currentTest: { testId: string, testInfo: TestInfo} | null) {
    this._currentTest = currentTest;
    setCurrentTestInfo(currentTest ? currentTest.testInfo : null);
  }

  // Returns TestArgs or undefined when env.beforeEach has failed.
  private async _runEnvBeforeEach(testInfo: TestInfo, testOptions: any): Promise<any> {
    try {
      return await this._envRunner.runBeforeEach(testInfo, testOptions, this._workerArgs);
    } catch (error) {
      if (error instanceof SkipError) {
        if (testInfo.status === 'passed')
          testInfo.status = 'skipped';
      } else {
        testInfo.status = 'failed';
        testInfo.error = serializeError(error);
      }
      // Failed to initialize environment - no need to run any hooks now.
      return undefined;
    }
  }

  private async _runTestWithBeforeHooks(test: Test, testInfo: TestInfo, testArgs: any) {
    try {
      await this._runHooks(test.spec.parent, 'beforeEach', testArgs, testInfo);
    } catch (error) {
      if (error instanceof SkipError) {
        if (testInfo.status === 'passed')
          testInfo.status = 'skipped';
      } else {
        testInfo.status = 'failed';
        testInfo.error = serializeError(error);
      }
      // Continue running afterEach hooks even after the failure.
    }

    // Do not run the test when beforeEach hook fails.
    if (this._isStopped || testInfo.status === 'failed' || testInfo.status === 'skipped')
      return;

    try {
      await test.spec.fn(testArgs, testInfo);
      testInfo.status = 'passed';
    } catch (error) {
      if (error instanceof SkipError) {
        if (testInfo.status === 'passed')
          testInfo.status = 'skipped';
      } else {
        testInfo.status = 'failed';
        testInfo.error = serializeError(error);
      }
    }
  }

  private async _runAfterHooks(test: Test, testInfo: TestInfo, testArgs: any) {
    try {
      await this._runHooks(test.spec.parent, 'afterEach', testArgs, testInfo);
    } catch (error) {
      // Do not overwrite test failure error.
      if (!(error instanceof SkipError) && testInfo.status === 'passed') {
        testInfo.status = 'failed';
        testInfo.error = serializeError(error);
        // Continue running even after the failure.
      }
    }
    try {
      await this._envRunner.runAfterEach();
    } catch (error) {
      // Do not overwrite test failure error.
      if (testInfo.status === 'passed') {
        testInfo.status = 'failed';
        testInfo.error = serializeError(error);
      }
    }
  }

  private async _runHooks(suite: Suite, type: 'beforeEach' | 'afterEach', testArgs: any, testInfo: TestInfo) {
    if (this._isStopped)
      return;
    const all = [];
    for (let s = suite; s; s = s.parent) {
      const funcs = s._hooks.filter(e => e.type === type).map(e => e.fn);
      all.push(...funcs.reverse());
    }
    if (type === 'beforeEach')
      all.reverse();
    let error: Error | undefined;
    for (const hook of all) {
      try {
        await hook(testArgs, testInfo);
      } catch (e) {
        // Always run all the hooks, and capture the first error.
        error = error || e;
      }
    }
    if (error)
      throw error;
  }

  private _reportDone() {
    const donePayload: DonePayload = {
      failedTestId: this._failedTestId,
      fatalError: this._fatalError,
      remaining: [...this._remaining.values()],
    };
    this.emit('done', donePayload);
  }

  private _reportDoneAndStop() {
    if (this._isStopped)
      return;
    this._reportDone();
    this.stop();
  }

  private _hasTestsToRun(suite: Suite): boolean {
    return suite.findSpec(spec => {
      const entry = this._entries.get(spec.tests[0]._id);
      return !!entry;
    });
  }

  private _specOptions(spec: Spec): any {
    const parents: Suite[] = [];
    for (let suite = spec.parent; suite; suite = suite.parent)
      parents.push(suite);
    const testOptions = parents.reverse().reduce((options, suite) => {
      return mergeObjects(options, suite._options);
    }, this._runList.options);
    return testOptions;
  }
}

function buildTestBeginPayload(testId: string, testInfo: TestInfo): TestBeginPayload {
  return {
    testId,
    workerIndex: testInfo.workerIndex
  };
}

function buildTestEndPayload(testId: string, testInfo: TestInfo): TestEndPayload {
  return {
    testId,
    duration: testInfo.duration,
    status: testInfo.status!,
    error: testInfo.error,
    data: testInfo.data,
    expectedStatus: testInfo.expectedStatus,
    annotations: testInfo.annotations,
    timeout: testInfo.timeout,
  };
}

const kTestArgsSymbol = Symbol('testargs');

function modifier(testInfo: TestInfo, type: 'skip' | 'fail' | 'fixme' | 'slow', arg?: boolean | string | Function, description?: string) {
  if (arg === undefined && description === undefined) {
    // No parameters - modifier applies.
  } else if (typeof arg === 'string') {
    // No condition - modifier applies.
    description = arg;
  } else {
    if (typeof arg === 'function')
      arg = arg(testInfo[kTestArgsSymbol]);
    if (!arg)
      return;
  }

  testInfo.annotations.push({ type, description });
  if (type === 'slow') {
    testInfo.setTimeout(testInfo.timeout * 3);
  } else if (type === 'skip' || type === 'fixme') {
    testInfo.expectedStatus = 'skipped';
    throw new SkipError('Test is skipped: ' + (description || ''));
  } else if (type === 'fail') {
    if (testInfo.expectedStatus !== 'skipped')
      testInfo.expectedStatus = 'failed';
  }
}

class SkipError extends Error {
}

async function wrapInPromise(value: any) {
  return value;
}

class EnvRunner {
  private envs: Env[];
  private workerArgs: any[] = [];
  private testArgs: any[] = [];
  private _isStopped = false;
  private _workerOptions: any = {};
  private _workerInfo: WorkerInfo | undefined;
  private _testOptions: any = {};
  private _testInfo: TestInfo | undefined;

  constructor(envs: Env[]) {
    this.envs = [...envs];
  }

  update(envs: Env[]) {
    this.envs = [...envs];
  }

  stop() {
    this._isStopped = true;
  }

  async runBeforeAll(workerInfo: WorkerInfo, workerOptions: any) {
    this._workerOptions = workerOptions;
    this._workerInfo = workerInfo;
    let args = {};
    for (const env of this.envs) {
      if (this._isStopped)
        break;
      let r: any = {};
      if (env.beforeAll)
        r = await env.beforeAll(mergeObjects(workerOptions, args), workerInfo);
      this.workerArgs.push(args);
      args = mergeObjects(args, r);
    }
    return args;
  }

  async runAfterAll() {
    let error: Error | undefined;
    const count = this.workerArgs.length;
    for (let index = count - 1; index >= 0; index--) {
      const args = this.workerArgs.pop();
      if (this.envs.length <= index)
        continue;
      const env = this.envs[index];
      if (env.afterAll) {
        try {
          await env.afterAll(mergeObjects(this._workerOptions, args), this._workerInfo!);
        } catch (e) {
          error = error || e;
        }
      }
    }
    if (error)
      throw error;
  }

  async runBeforeEach(testInfo: TestInfo, testOptions: any, workerArgs: any) {
    this._testOptions = testOptions;
    this._testInfo = testInfo;
    let args = workerArgs;
    for (const env of this.envs) {
      if (this._isStopped)
        break;
      let r: any = {};
      if (env.beforeEach)
        r = await env.beforeEach(mergeObjects(args, testOptions), testInfo);
      this.testArgs.push(args);
      args = mergeObjects(args, r);
    }
    return args;
  }

  async runAfterEach() {
    let error: Error | undefined;
    const count = this.testArgs.length;
    for (let index = count - 1; index >= 0; index--) {
      const args = this.testArgs.pop();
      if (this.envs.length <= index)
        continue;
      const env = this.envs[index];
      if (env.afterEach) {
        try {
          await env.afterEach(mergeObjects(args, this._testOptions), this._testInfo!);
        } catch (e) {
          error = error || e;
        }
      }
    }
    if (error)
      throw error;
  }
}
