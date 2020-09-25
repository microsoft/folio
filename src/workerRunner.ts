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

import { FixturePool, rerunRegistrations, assignParameters, TestInfo, parameters } from './fixtures';
import { EventEmitter } from 'events';
import { WorkerSpec, WorkerSuite } from './workerTest';
import { Config } from './config';
import * as util from 'util';
import { serializeError } from './util';
import { TestBeginPayload, TestEndPayload, RunPayload, TestEntry, TestOutputPayload, DonePayload } from './ipc';
import { workerSpec } from './workerSpec';
import { debugLog } from './debug';

export const fixturePool = new FixturePool();

function chunkToParams(chunk: Buffer | string):  { text?: string, buffer?: string } {
  if (chunk instanceof Buffer)
    return { buffer: chunk.toString('base64') };
  if (typeof chunk !== 'string')
    return { text: util.inspect(chunk) };
  return { text: chunk };
}

export class WorkerRunner extends EventEmitter {
  private _failedTestId: string | undefined;
  private _fatalError: any | undefined;
  private _entries: Map<string, TestEntry>;
  private _remaining: Map<string, TestEntry>;
  private _stopped: any;
  private _parsedParameters: any = {};
  private _config: Config;
  private _testId: string | null;
  private _stdOutBuffer: (string | Buffer)[] = [];
  private _stdErrBuffer: (string | Buffer)[] = [];
  private _testInfo: TestInfo | null = null;
  private _suite: WorkerSuite;
  private _loaded = false;
  private _parametersString: string;
  private _workerIndex: number;

  constructor(runPayload: RunPayload, config: Config, workerIndex: number) {
    super();
    this._suite = new WorkerSuite('');
    this._suite.file = runPayload.file;
    this._workerIndex = workerIndex;
    this._parametersString = runPayload.parametersString;
    this._entries = new Map(runPayload.entries.map(e => [ e.testId, e ]));
    this._remaining = new Map(runPayload.entries.map(e => [ e.testId, e ]));
    this._config = config;
    this._parsedParameters = runPayload.parameters;
    this._parsedParameters['testConfig'] = config;
    this._parsedParameters['testWorkerIndex'] = workerIndex;
  }

  stop() {
    this._stopped = true;
  }

  unhandledError(error: Error | any) {
    if (this._testInfo) {
      this._testInfo.status = 'failed';
      this._testInfo.error = serializeError(error);
      this._failedTestId = this._testId;
      this._stopped = true;
      this.emit('testEnd', buildTestEndPayload(this._testId, this._testInfo));
      this._testInfo = null;
    } else if (!this._loaded) {
      // No current test - fatal error.
      this._fatalError = serializeError(error);
    }
    this._reportDone();
  }

  stdout(chunk: string | Buffer) {
    this._stdOutBuffer.push(chunk);
    for (const c of this._stdOutBuffer) {
      const outPayload: TestOutputPayload = { testId: this._testId, ...chunkToParams(c) };
      this.emit('testStdOut', outPayload);
    }
    this._stdOutBuffer = [];
  }

  stderr(chunk: string | Buffer) {
    this._stdErrBuffer.push(chunk);
    for (const c of this._stdErrBuffer) {
      const outPayload: TestOutputPayload = { testId: this._testId, ...chunkToParams(c) };
      this.emit('testStdErr', outPayload);
    }
    this._stdErrBuffer = [];
  }

  async run() {
    assignParameters(this._parsedParameters);

    const revertBabelRequire = workerSpec(this._suite);

    require(this._suite.file);
    revertBabelRequire();
    // Enumerate tests to assign ordinals.
    this._suite._renumber();
    // Build ids from ordinals + parameters strings.
    this._suite._assignIds(this._parametersString);
    this._loaded = true;

    rerunRegistrations(this._suite.file);
    await this._runSuite(this._suite);
    this._reportDone();
  }

  private async _runSuite(suite: WorkerSuite) {
    try {
      await this._runHooks(suite, 'beforeAll', 'before');
    } catch (e) {
      this._fatalError = serializeError(e);
      this._reportDone();
    }
    for (const entry of suite._entries) {
      if (entry instanceof WorkerSuite)
        await this._runSuite(entry);
      else
        await this._runTest(entry as WorkerSpec);
    }
    try {
      await this._runHooks(suite, 'afterAll', 'after');
    } catch (e) {
      this._fatalError = serializeError(e);
      this._reportDone();
    }
  }

  private async _runTest(test: WorkerSpec) {
    if (this._stopped)
      return;
    if (!this._entries.has(test._id))
      return;
    const { timeout, expectedStatus, skipped } = this._entries.get(test._id);
    this._remaining.delete(test._id);

    const testId = test._id;
    this._testId = testId;

    const testInfo: TestInfo = {
      title: test.title,
      file: test.file,
      location: test.location,
      fn: test.fn,
      config: this._config,
      parameters,
      workerIndex: this._workerIndex,
      expectedStatus: expectedStatus,
      duration: 0,
      status: 'passed',
      stdout: [],
      stderr: [],
      data: {},
    };
    this._testInfo = testInfo;
    assignParameters({ 'testInfo': testInfo });

    this.emit('testBegin', buildTestBeginPayload(testId, testInfo));

    if (skipped) {
      // TODO: don't even send those to the worker.
      testInfo.status = 'skipped';
      this.emit('testEnd', buildTestEndPayload(testId, testInfo));
      return;
    }

    const startTime = Date.now();
    try {
      await this._runHooks(test.parent as WorkerSuite, 'beforeEach', 'before', testInfo);
      debugLog(`running test "${test.fullTitle}"`);
      if (this._stopped)
        return;
      await fixturePool.runTestWithFixturesAndTimeout(test.fn, timeout, testInfo);
      debugLog(`done running test "${test.fullTitle}"`);
      await this._runHooks(test.parent as WorkerSuite, 'afterEach', 'after', testInfo);
    } catch (error) {
      // Error in the test fixture teardown.
      testInfo.status = 'failed';
      testInfo.error = serializeError(error);
    }
    testInfo.duration = Date.now() - startTime;
    if (this._testInfo) {
      // We could have reported end due to an unhandled exception.
      this.emit('testEnd', buildTestEndPayload(testId, testInfo));
    }
    if (!this._stopped && testInfo.status !== 'passed') {
      this._failedTestId = this._testId;
      this._stopped = true;
    }
    this._testInfo = null;
    this._testId = null;
  }

  private async _runHooks(suite: WorkerSuite, type: string, dir: 'before' | 'after', testInfo?: TestInfo) {
    if (this._stopped)
      return;
    debugLog(`running hooks "${type}" for suite "${suite.fullTitle}"`);
    if (!this._hasTestsToRun(suite))
      return;
    const all = [];
    for (let s = suite; s; s = s.parent as WorkerSuite) {
      const funcs = s._hooks.filter(e => e.type === type).map(e => e.fn);
      all.push(...funcs.reverse());
    }
    if (dir === 'before')
      all.reverse();
    for (const hook of all)
      await fixturePool.resolveParametersAndRun(hook);
    debugLog(`done running hooks "${type}" for suite "${suite.fullTitle}"`);
  }

  private _reportDone() {
    const donePayload: DonePayload = {
      failedTestId: this._failedTestId,
      fatalError: this._fatalError,
      remaining: [...this._remaining.values()],
    };
    this.emit('done', donePayload);
  }

  private _hasTestsToRun(suite: WorkerSuite): boolean {
    return suite.findSpec((test: WorkerSpec) => {
      const entry = this._entries.get(test._id);
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
