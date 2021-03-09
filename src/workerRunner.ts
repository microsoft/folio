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
import { monotonicTime, raceAgainstDeadline, serializeError } from './util';
import { TestBeginPayload, TestEndPayload, RunPayload, TestEntry, DonePayload } from './ipc';
import { debugLog } from './debug';
import { config, setCurrentTestInfo, currentWorkerIndex } from './fixtures';
import { FixtureLoader } from './fixtureLoader';
import { RootSuite, Spec, Suite, Test } from './test';
import { installTransform } from './transform';
import { clearCurrentFile, setCurrentFile } from './spec';
import { TestInfo } from './types';

export const fixtureLoader = new FixtureLoader();

export class WorkerRunner extends EventEmitter {
  private _failedTestId: string | undefined;
  private _fatalError: any | undefined;
  private _entries: Map<string, TestEntry>;
  private _remaining: Map<string, TestEntry>;
  private _isStopped: any;
  private _variation: folio.SuiteVariation;
  _testId: string | null;
  private _testInfo: TestInfo | null = null;
  private _rootSuite: Suite;
  private _loaded = false;
  private _repeatEachIndex: number;

  constructor(variation: folio.SuiteVariation, repeatEachIndex: number, runPayload: RunPayload) {
    super();
    this._rootSuite = new Suite('');
    this._rootSuite.file = runPayload.file;
    this._repeatEachIndex = repeatEachIndex;
    this._entries = new Map(runPayload.entries.map(e => [ e.testId, e ]));
    this._remaining = new Map(runPayload.entries.map(e => [ e.testId, e ]));
    this._variation = variation;
  }

  loadFixtureFiles(files: string[]) {
    for (const file of files)
      fixtureLoader.loadFixtureFile(file);
  }

  stop() {
    this._isStopped = true;
    this._testId = null;
    this._setCurrentTestInfo(null);
  }

  unhandledError(error: Error | any) {
    if (this._isStopped)
      return;
    if (this._testInfo) {
      this._testInfo.status = 'failed';
      this._testInfo.error = serializeError(error);
      this._failedTestId = this._testId;
      this.emit('testEnd', buildTestEndPayload(this._testId, this._testInfo));
    } else if (!this._loaded) {
      // No current test - fatal error.
      this._fatalError = serializeError(error);
    }
    this._reportDoneAndStop();
  }

  async run() {
    const suites: RootSuite[] = [];
    const revertBabelRequire = installTransform();
    setCurrentFile(this._rootSuite.file, suites, fixtureLoader.fixturePool);
    require(this._rootSuite.file);
    clearCurrentFile();
    revertBabelRequire();
    for (const suite of suites) {
      suite._renumber();
      suite.findSpec(spec => {
        spec._appendTest(this._variation, this._repeatEachIndex);
      });
      this._rootSuite._addSuite(suite);
    }
    this._loaded = true;

    await this._runSuite(this._rootSuite);
    this._reportDoneAndStop();
  }

  private async _runSuite(suite: Suite) {
    if (this._isStopped)
      return;
    try {
      await this._runHooks(suite, 'beforeAll', 'before');
    } catch (e) {
      this._fatalError = serializeError(e);
      this._reportDoneAndStop();
    }
    for (const entry of suite._entries) {
      if (entry instanceof Suite)
        await this._runSuite(entry);
      else
        await this._runSpec(entry);
    }
    try {
      await this._runHooks(suite, 'afterAll', 'after');
    } catch (e) {
      this._fatalError = serializeError(e);
      this._reportDoneAndStop();
    }
  }

  private async _runSpec(spec: Spec) {
    if (this._isStopped)
      return;
    const test = spec.tests[0];
    if (!this._entries.has(test._id))
      return;
    const { timeout, expectedStatus, skipped, retry } = this._entries.get(test._id);
    const deadline = timeout ? monotonicTime() + timeout : 0;
    this._remaining.delete(test._id);

    const testId = test._id;
    this._testId = testId;

    this._setCurrentTestInfo({
      title: spec.title,
      file: spec.file,
      line: spec.line,
      column: spec.column,
      fn: spec.fn,
      options: spec._options(),
      variation: this._variation,
      repeatEachIndex: this._repeatEachIndex,
      workerIndex: currentWorkerIndex(),
      retry,
      expectedStatus,
      duration: 0,
      status: 'passed',
      stdout: [],
      stderr: [],
      timeout,
      data: {},
      relativeArtifactsPath: '',
      outputPath: () => '',
      snapshotPath: () => ''
    });

    this.emit('testBegin', buildTestBeginPayload(testId, this._testInfo));

    if (skipped) {
      // TODO: don't even send those to the worker.
      this._testInfo.status = 'skipped';
      this.emit('testEnd', buildTestEndPayload(testId, this._testInfo));
      return;
    }

    const startTime = monotonicTime();

    let result = await raceAgainstDeadline(this._runTestWithFixturesAndHooks(test, this._testInfo), deadline);
    // Do not overwrite test failure upon timeout in fixture or hook.
    if (result.timedOut && this._testInfo.status === 'passed')
      this._testInfo.status = 'timedOut';

    if (!result.timedOut) {
      result = await raceAgainstDeadline(this._tearDownTestScope(this._testInfo), deadline);
      // Do not overwrite test failure upon timeout in fixture or hook.
      if (result.timedOut && this._testInfo.status === 'passed')
        this._testInfo.status = 'timedOut';
    } else {
      // A timed-out test gets a full additional timeout to teardown test fixture scope.
      const newDeadline = timeout ? monotonicTime() + timeout : 0;
      await raceAgainstDeadline(this._tearDownTestScope(this._testInfo), newDeadline);
    }

    // Async hop above, we could have stopped.
    if (!this._testInfo)
      return;

    this._testInfo.duration = monotonicTime() - startTime;
    this.emit('testEnd', buildTestEndPayload(testId, this._testInfo));
    if (this._testInfo.status !== 'passed') {
      this._failedTestId = this._testId;
      this._reportDoneAndStop();
    }
    this._setCurrentTestInfo(null);
    this._testId = null;
  }

  private _setCurrentTestInfo(testInfo: TestInfo | null) {
    this._testInfo = testInfo;
    setCurrentTestInfo(testInfo);
  }

  private async _runTestWithFixturesAndHooks(test: Test, testInfo: TestInfo) {
    try {
      await this._runHooks(test.spec.parent, 'beforeEach', 'before');
    } catch (error) {
      testInfo.status = 'failed';
      testInfo.error = serializeError(error);
      // Continue running afterEach hooks even after the failure.
    }

    debugLog(`running test "${test.spec.fullTitle()}"`);
    try {
      // Do not run the test when beforeEach hook fails.
      if (!this._isStopped && testInfo.status !== 'failed') {
        // Run internal fixtures to resolve artifacts and output paths
        const parametersPathSegment = (await fixtureLoader.fixturePool.setupFixture('testParametersPathSegment')).value;
        testInfo.relativeArtifactsPath = relativeArtifactsPath(testInfo, parametersPathSegment);
        testInfo.outputPath = outputPath(testInfo);
        testInfo.snapshotPath = snapshotPath(testInfo);
        await fixtureLoader.fixturePool.resolveParametersAndRunHookOrTest(test.spec.fn);
        testInfo.status = 'passed';
      }
    } catch (error) {
      testInfo.status = 'failed';
      testInfo.error = serializeError(error);
      // Continue running afterEach hooks and fixtures teardown even after the failure.
    }
    debugLog(`done running test "${test.spec.fullTitle()}"`);
    try {
      await this._runHooks(test.spec.parent, 'afterEach', 'after');
    } catch (error) {
      // Do not overwrite test failure error.
      if (testInfo.status === 'passed') {
        testInfo.status = 'failed';
        testInfo.error = serializeError(error);
        // Continue running fixtures teardown even after the failure.
      }
    }
  }

  private async _tearDownTestScope(testInfo: TestInfo) {
    // Worker will tear down test scope if we are stopped.
    if (this._isStopped)
      return;
    try {
      await fixtureLoader.fixturePool.teardownScope('test');
    } catch (error) {
      // Do not overwrite test failure or hook error.
      if (testInfo.status === 'passed') {
        testInfo.status = 'failed';
        testInfo.error = serializeError(error);
      }
    }
  }

  private async _runHooks(suite: Suite, type: string, dir: 'before' | 'after') {
    if (this._isStopped)
      return;
    debugLog(`running hooks "${type}" for suite "${suite.fullTitle()}"`);
    if (!this._hasTestsToRun(suite))
      return;
    const all = [];
    for (let s = suite; s; s = s.parent) {
      const funcs = s._hooks.filter(e => e.type === type).map(e => e.fn);
      all.push(...funcs.reverse());
    }
    if (dir === 'before')
      all.reverse();
    let error: Error | undefined;
    for (const hook of all) {
      try {
        await fixtureLoader.fixturePool.resolveParametersAndRunHookOrTest(hook);
      } catch (e) {
        // Always run all the hooks, and capture the first error.
        error = error || e;
      }
    }
    debugLog(`done running hooks "${type}" for suite "${suite.fullTitle()}"`);
    if (error)
      throw error;
  }

  private _reportDoneAndStop() {
    if (this._isStopped)
      return;
    const donePayload: DonePayload = {
      failedTestId: this._failedTestId,
      fatalError: this._fatalError,
      remaining: [...this._remaining.values()],
    };
    this.emit('done', donePayload);
    this.stop();
  }

  private _hasTestsToRun(suite: Suite): boolean {
    return suite.findSpec(spec => {
      const entry = this._entries.get(spec.tests[0]._id);
      if (!entry)
        return;
      const { skipped } = entry;
      return !skipped;
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
    status: testInfo.status,
    error: testInfo.error,
    data: testInfo.data,
  };
}

function relativeArtifactsPath(testInfo: TestInfo, parametersPathSegment: string) {
  const relativePath = path.relative(config.testDir, testInfo.file.replace(/\.(spec|test)\.(js|ts)/, ''));
  const sanitizedTitle = testInfo.title.replace(/[^\w\d]+/g, '-');
  return path.join(relativePath, sanitizedTitle, parametersPathSegment);
}

function outputPath(testInfo: TestInfo): (...pathSegments: string[]) => string {
  const retrySuffix = testInfo.retry ? '-retry' + testInfo.retry : '';
  const repeatEachSuffix = testInfo.repeatEachIndex ? '-repeat' + testInfo.repeatEachIndex : '';
  const basePath = path.join(config.outputDir, testInfo.relativeArtifactsPath) + retrySuffix + repeatEachSuffix;
  return (...pathSegments: string[]): string => {
    fs.mkdirSync(basePath, { recursive: true });
    return path.join(basePath, ...pathSegments);
  };
}

function snapshotPath(testInfo: TestInfo): (...pathSegments: string[]) => string {
  const basePath = path.join(config.testDir, config.snapshotDir, testInfo.relativeArtifactsPath);
  return (...pathSegments: string[]): string => {
    return path.join(basePath, ...pathSegments);
  };
}
