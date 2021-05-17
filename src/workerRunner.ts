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
import rimraf from 'rimraf';
import util from 'util';
import { EventEmitter } from 'events';
import { monotonicTime, DeadlineRunner, raceAgainstDeadline, serializeError } from './util';
import { TestBeginPayload, TestEndPayload, RunPayload, TestEntry, DonePayload, WorkerInitParams } from './ipc';
import { setCurrentTestInfo } from './globals';
import { Loader } from './loader';
import { Spec, Suite, Test } from './test';
import { TestInfo, WorkerInfo } from './types';
import { ProjectImpl } from './project';
import { FixtureRunner } from './fixtures';

const removeFolderAsync = util.promisify(rimraf);

export class WorkerRunner extends EventEmitter {
  private _params: WorkerInitParams;
  private _loader: Loader;
  private _project: ProjectImpl;
  private _outputPathSegment: string;
  private _workerInfo: WorkerInfo;
  private _fixtureRunner: FixtureRunner;

  private _failedTestId: string | undefined;
  private _fatalError: any | undefined;
  private _entries: Map<string, TestEntry>;
  private _remaining: Map<string, TestEntry>;
  private _isStopped: any;
  _currentTest: { testId: string, testInfo: TestInfo } | null = null;

  constructor(params: WorkerInitParams) {
    super();
    this._params = params;
    this._fixtureRunner = new FixtureRunner();
  }

  stop() {
    this._isStopped = true;
    this._setCurrentTest(null);
  }

  async cleanup() {
    // TODO: separate timeout for teardown?
    const result = await raceAgainstDeadline((async () => {
      await this._fixtureRunner.teardownScope('test');
      await this._fixtureRunner.teardownScope('worker');
    })(), this._deadline());
    if (result.timedOut)
      throw new Error(`Timeout of ${this._project.config.timeout}ms exceeded while shutting down environment`);
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
    return this._project.config.timeout ? monotonicTime() + this._project.config.timeout : undefined;
  }

  private _loadIfNeeded() {
    if (this._loader)
      return;

    this._loader = Loader.deserialize(this._params.loader);
    this._project = this._loader.projects()[this._params.projectIndex];

    const sameName = this._loader.projects().filter(project => project.config.name === this._project.config.name);
    if (sameName.length > 1)
      this._outputPathSegment = this._project.config.name + (sameName.indexOf(this._project) + 1);
    else
      this._outputPathSegment = this._project.config.name;
    if (this._outputPathSegment)
      this._outputPathSegment = '-' + this._outputPathSegment;

    this._workerInfo = {
      workerIndex: this._params.workerIndex,
      project: this._project.config,
      config: this._loader.fullConfig(),
    };
  }

  async run(runPayload: RunPayload) {
    this._entries = new Map(runPayload.entries.map(e => [ e.testId, e ]));
    this._remaining = new Map(runPayload.entries.map(e => [ e.testId, e ]));

    this._loadIfNeeded();
    const fileSuite = this._loader.loadTestFile(runPayload.file);
    let anySpec: Spec | undefined;
    fileSuite.findSpec(spec => {
      const test = this._project.generateTests(spec, this._params.repeatEachIndex)[0];
      if (this._entries.has(test._id))
        anySpec = spec;
    });
    if (!anySpec) {
      this._reportDone();
      return;
    }

    this._fixtureRunner.setPool(this._project.buildPool(anySpec));
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
      const result = await raceAgainstDeadline(this._fixtureRunner.resolveParametersAndRunHookOrTest(hook.fn, 'worker', this._workerInfo), this._deadline());
      if (result.timedOut) {
        this._fatalError = serializeError(new Error(`Timeout of ${this._project.config.timeout}ms exceeded while running beforeAll hook`));
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
      const result = await raceAgainstDeadline(this._fixtureRunner.resolveParametersAndRunHookOrTest(hook.fn, 'worker', this._workerInfo), this._deadline());
      if (result.timedOut) {
        this._fatalError = serializeError(new Error(`Timeout of ${this._project.config.timeout}ms exceeded while running afterAll hook`));
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
    const testId = test._id;

    const relativeTestFilePath = path.relative(this._project.config.testDir, spec.file.replace(/\.(spec|test)\.(js|ts)/, ''));
    const relativeTestFilePathForSnapshots = path.relative(this._project.useRootDirForSnapshots ? this._loader.fullConfig().rootDir : this._project.config.testDir, spec.file.replace(/\.(spec|test)\.(js|ts)/, ''));
    const sanitizedTitle = spec.title.replace(/[^\w\d]+/g, '-');
    const baseOutputDir = (() => {
      const sanitizedRelativePath = relativeTestFilePath.replace(process.platform === 'win32' ? new RegExp('\\\\', 'g') : new RegExp('/', 'g'), '-');
      let testOutputDir = sanitizedRelativePath + '-' + sanitizedTitle + this._outputPathSegment;
      if (entry.retry)
        testOutputDir += '-retry' + entry.retry;
      if (this._params.repeatEachIndex)
        testOutputDir += '-repeat' + this._params.repeatEachIndex;
      return path.join(this._project.config.outputDir, testOutputDir);
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
      timeout: this._project.config.timeout,
      data: {},
      snapshotPathSegment: '',
      outputDir: baseOutputDir,
      outputPath: (...pathSegments: string[]): string => {
        fs.mkdirSync(baseOutputDir, { recursive: true });
        return path.join(baseOutputDir, ...pathSegments);
      },
      snapshotPath: (...pathSegments: string[]): string => {
        const basePath = path.join(this._project.config.snapshotDir, relativeTestFilePathForSnapshots, sanitizedTitle, testInfo.snapshotPathSegment);
        return path.join(basePath, ...pathSegments);
      },
      skip: (...args: [arg?: any, description?: string]) => modifier(testInfo, 'skip', args),
      fixme: (...args: [arg?: any, description?: string]) => modifier(testInfo, 'fixme', args),
      fail: (...args: [arg?: any, description?: string]) => modifier(testInfo, 'fail', args),
      slow: (...args: [arg?: any, description?: string]) => modifier(testInfo, 'slow', args),
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

    // Update the fixture pool - it may differ between tests, but only in test-scoped fixtures.
    this._fixtureRunner.setPool(this._project.buildPool(spec));

    deadlineRunner = new DeadlineRunner(this._runTestWithBeforeHooks(test, testInfo), deadline());
    const result = await deadlineRunner.result;
    // Do not overwrite test failure upon hook timeout.
    if (result.timedOut && testInfo.status === 'passed')
      testInfo.status = 'timedOut';
    if (this._isStopped)
      return;

    if (!result.timedOut) {
      deadlineRunner = new DeadlineRunner(this._runAfterHooks(test, testInfo), deadline());
      deadlineRunner.setDeadline(deadline());
      const hooksResult = await deadlineRunner.result;
      // Do not overwrite test failure upon hook timeout.
      if (hooksResult.timedOut && testInfo.status === 'passed')
        testInfo.status = 'timedOut';
    } else {
      // A timed-out test gets a full additional timeout to run after hooks.
      const newDeadline = this._deadline();
      deadlineRunner = new DeadlineRunner(this._runAfterHooks(test, testInfo), newDeadline);
      await deadlineRunner.result;
    }

    if (this._isStopped)
      return;

    testInfo.duration = monotonicTime() - startTime;
    this.emit('testEnd', buildTestEndPayload(testId, testInfo));

    const isFailure = testInfo.status === 'timedOut' || (testInfo.status === 'failed' && testInfo.expectedStatus !== 'failed');
    const preserveOutput = this._loader.fullConfig().preserveOutput === 'always' ||
      (this._loader.fullConfig().preserveOutput === 'failures-only' && isFailure);
    if (!preserveOutput)
      await removeFolderAsync(testInfo.outputDir).catch(e => {});

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

  private async _runTestWithBeforeHooks(test: Test, testInfo: TestInfo) {
    try {
      await this._runHooks(test.spec.parent, 'beforeEach', testInfo);
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
      await this._fixtureRunner.resolveParametersAndRunHookOrTest(test.spec.fn, 'test', testInfo);
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

  private async _runAfterHooks(test: Test, testInfo: TestInfo) {
    try {
      await this._runHooks(test.spec.parent, 'afterEach', testInfo);
    } catch (error) {
      // Do not overwrite test failure error.
      if (!(error instanceof SkipError) && testInfo.status === 'passed') {
        testInfo.status = 'failed';
        testInfo.error = serializeError(error);
        // Continue running even after the failure.
      }
    }
    try {
      await this._fixtureRunner.teardownScope('test');
    } catch (error) {
      // Do not overwrite test failure error.
      if (testInfo.status === 'passed') {
        testInfo.status = 'failed';
        testInfo.error = serializeError(error);
      }
    }
  }

  private async _runHooks(suite: Suite, type: 'beforeEach' | 'afterEach', testInfo: TestInfo) {
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
        await this._fixtureRunner.resolveParametersAndRunHookOrTest(hook, 'test', testInfo);
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

function modifier(testInfo: TestInfo, type: 'skip' | 'fail' | 'fixme' | 'slow', modifierArgs: [arg?: any, description?: string]) {
  if (modifierArgs.length >= 1 && !modifierArgs[0])
    return;

  const description = modifierArgs?.[1];
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
