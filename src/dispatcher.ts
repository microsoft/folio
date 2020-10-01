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

import child_process from 'child_process';
import path from 'path';
import { EventEmitter } from 'events';
import { FixturePool } from './fixtures';
import { RunPayload, TestBeginPayload, TestEndPayload, DonePayload, TestOutputPayload, Parameters } from './ipc';
import { Config } from './config';
import { Reporter } from './reporter';
import assert from 'assert';
import { RunnerSuite, RunnerTest } from './runnerTest';
import { TestResult } from './test';

export class Dispatcher {
  private _workers = new Set<Worker>();
  private _freeWorkers: Worker[] = [];
  private _workerClaimers: (() => void)[] = [];

  private _testById = new Map<string, { test: RunnerTest, result: TestResult }>();
  private _queue: RunPayload[] = [];
  private _stopCallback: () => void;
  readonly _config: Config;
  private _suite: RunnerSuite;
  private _reporter: Reporter;
  private _hasWorkerErrors = false;

  constructor(suite: RunnerSuite, config: Config, reporter: Reporter) {
    this._config = config;
    this._reporter = reporter;

    this._suite = suite;
    for (const suite of this._suite.suites) {
      for (const spec of suite._allSpecs()) {
        for (const test of spec.tests as RunnerTest[])
          this._testById.set(test._id, { test, result: test._appendTestResult() });
      }
    }

    this._queue = this._filesSortedByWorkerHash();

    // Shard tests.
    let total = this._suite.total;
    let shardDetails = '';
    if (this._config.shard) {
      total = 0;
      const shardSize = Math.ceil(this._suite.total / this._config.shard.total);
      const from = shardSize * this._config.shard.current;
      const to = shardSize * (this._config.shard.current + 1);
      shardDetails = `, shard ${this._config.shard.current + 1} or ${this._config.shard.total}`;
      let current = 0;
      const filteredQueue: RunPayload[] = [];
      for (const runPayload of this._queue) {
        if (current >= from && current < to) {
          filteredQueue.push(runPayload);
          total += runPayload.entries.length;
        }
        current += runPayload.entries.length;
      }
      this._queue = filteredQueue;
    }

    if (process.stdout.isTTY) {
      const workers = new Set<string>();
      suite.findSpec(test => {
        for (const variant of test.tests as RunnerTest[])
          workers.add(test.file + variant._workerHash);
      });
      console.log();
      const jobs = Math.min(config.workers, workers.size);
      console.log(`Running ${total} test${total > 1 ? 's' : ''} using ${jobs} worker${jobs > 1 ? 's' : ''}${shardDetails}`);
    }
  }

  _filesSortedByWorkerHash(): RunPayload[] {
    const runPayloads: RunPayload[] = [];
    for (const suite of this._suite.suites) {
      const testsByWorkerHash = new Map<string, {
        tests: RunnerTest[],
        parameters: Parameters,
        parametersString: string
      }>();
      for (const spec of suite._allSpecs()) {
        for (const test of spec.tests as RunnerTest[]) {
          let entry = testsByWorkerHash.get(test._workerHash);
          if (!entry) {
            entry = {
              tests: [],
              parameters: test.parameters,
              parametersString: test._parametersString
            };
            testsByWorkerHash.set(test._workerHash, entry);
          }
          entry.tests.push(test);
        }
      }
      if (!testsByWorkerHash.size)
        continue;
      for (const [hash, entry] of testsByWorkerHash) {
        const entries = entry.tests.map(test => {
          return {
            retry: this._testById.get(test._id).result.retry,
            testId: test._id,
            expectedStatus: test.expectedStatus,
            timeout: test.timeout,
            skipped: test.skipped
          };
        });
        runPayloads.push({
          entries,
          file: suite.file,
          parameters: entry.parameters,
          parametersString: entry.parametersString,
          hash,
        });
      }
    }
    runPayloads.sort((a, b) => a.hash < b.hash ? -1 : (a.hash === b.hash ? 0 : 1));
    return runPayloads;
  }

  async run() {
    // Loop in case job schedules more jobs
    while (this._queue.length)
      await this._dispatchQueue();
  }

  async _dispatchQueue() {
    const jobs = [];
    while (this._queue.length) {
      const file = this._queue.shift();
      const requiredHash = file.hash;
      let worker = await this._obtainWorker();
      while (worker.hash && worker.hash !== requiredHash) {
        this._restartWorker(worker);
        worker = await this._obtainWorker();
      }
      jobs.push(this._runJob(worker, file));
    }
    await Promise.all(jobs);
  }

  async _runJob(worker: Worker, runPayload: RunPayload) {
    worker.run(runPayload);
    let doneCallback;
    const result = new Promise(f => doneCallback = f);
    worker.once('done', (params: DonePayload) => {
      // We won't file remaining if:
      // - there are no remaining
      // - we are here not because something failed
      // - no unrecoverable worker error
      if (!params.remaining.length && !params.failedTestId && !params.fatalError) {
        this._workerAvailable(worker);
        doneCallback();
        return;
      }

      // When worker encounters error, we will restart it.
      this._restartWorker(worker);

      // In case of fatal error, we are done with the entry.
      if (params.fatalError) {
        // Report all the tests are failing with this error.
        for (const { testId } of runPayload.entries) {
          const { test, result } = this._testById.get(testId);
          this._reporter.onTestBegin(test);
          result.status = 'failed';
          result.error = params.fatalError;
          this._reporter.onTestEnd(test, result);
        }
        doneCallback();
        return;
      }

      const remaining = params.remaining;

      // Only retry expected failures, not passes and only if the test failed.
      if (this._config.retries && params.failedTestId) {
        const pair = this._testById.get(params.failedTestId);
        if (pair.test.expectedStatus === 'passed' && pair.test.results.length < this._config.retries + 1) {
          pair.result = pair.test._appendTestResult();
          remaining.unshift({
            retry: pair.result.retry,
            testId: pair.test._id,
            expectedStatus: pair.test.expectedStatus,
            timeout: pair.test.timeout,
            skipped: pair.test.skipped,
          });
        }
      }

      if (remaining.length)
        this._queue.unshift({ ...runPayload, entries: remaining });

      // This job is over, we just scheduled another one.
      doneCallback();
    });
    return result;
  }

  async _obtainWorker() {
    // If there is worker, use it.
    if (this._freeWorkers.length)
      return this._freeWorkers.pop();
    // If we can create worker, create it.
    if (this._workers.size < this._config.workers)
      this._createWorker();
    // Wait for the next available worker.
    await new Promise(f => this._workerClaimers.push(f));
    return this._freeWorkers.pop();
  }

  async _workerAvailable(worker) {
    this._freeWorkers.push(worker);
    if (this._workerClaimers.length) {
      const callback = this._workerClaimers.shift();
      callback();
    }
  }

  _createWorker() {
    const worker = new Worker(this);
    worker.on('testBegin', (params: TestBeginPayload) => {
      const { test, result: testRun  } = this._testById.get(params.testId);
      testRun.workerIndex = params.workerIndex;
      this._reporter.onTestBegin(test);
    });
    worker.on('testEnd', (params: TestEndPayload) => {
      const { test, result } = this._testById.get(params.testId);
      result.data = params.data;
      result.duration = params.duration;
      result.error = params.error;
      result.status = params.status;
      this._reporter.onTestEnd(test, result);
    });
    worker.on('stdOut', (params: TestOutputPayload) => {
      const chunk = chunkFromParams(params);
      const pair = this._testById.get(params.testId);
      if (pair)
        pair.result.stdout.push(chunk);
      this._reporter.onStdOut(chunk, pair ? pair.test : undefined);
    });
    worker.on('stdErr', (params: TestOutputPayload) => {
      const chunk = chunkFromParams(params);
      const pair = this._testById.get(params.testId);
      if (pair)
        pair.result.stderr.push(chunk);
      this._reporter.onStdErr(chunk, pair ? pair.test : undefined);
    });
    worker.on('teardownError', ({error}) => {
      this._hasWorkerErrors = true;
      this._reporter.onError(error);
    });
    worker.on('exit', () => {
      this._workers.delete(worker);
      if (this._stopCallback && !this._workers.size)
        this._stopCallback();
    });
    this._workers.add(worker);
    worker.init().then(() => this._workerAvailable(worker));
  }

  async _restartWorker(worker) {
    await worker.stop();
    this._createWorker();
  }

  async stop() {
    if (!this._workers.size)
      return;
    const result = new Promise(f => this._stopCallback = f);
    for (const worker of this._workers)
      worker.stop();
    await result;
  }

  hasWorkerErrors(): boolean {
    return this._hasWorkerErrors;
  }
}

let lastWorkerIndex = 0;

class Worker extends EventEmitter {
  process: child_process.ChildProcess;
  runner: Dispatcher;
  hash: string;
  index: number;
  stdout: any[];
  stderr: any[];

  constructor(runner: Dispatcher) {
    super();
    this.runner = runner;
    this.index = lastWorkerIndex++;

    this.process = child_process.fork(path.join(__dirname, 'worker.js'), {
      detached: false,
      env: {
        FORCE_COLOR: process.stdout.isTTY ? '1' : '0',
        DEBUG_COLORS: process.stdout.isTTY ? '1' : '0',
        ...process.env
      },
      // Can't pipe since piping slows down termination for some reason.
      stdio: ['ignore', 'ignore', process.env.PW_RUNNER_DEBUG ? 'inherit' : 'ignore', 'ipc']
    });
    this.process.on('exit', () => this.emit('exit'));
    this.process.on('error', e => {});  // do not yell at a send to dead process.
    this.process.on('message', (message: any) => {
      const { method, params } = message;
      this.emit(method, params);
    });
  }

  async init() {
    this.process.send({ method: 'init', params: { workerIndex: this.index, ...this.runner._config } });
    await new Promise(f => this.process.once('message', f));  // Ready ack
  }

  run(entry: RunPayload) {
    this.hash = entry.hash;
    this.process.send({ method: 'run', params: { entry, config: this.runner._config } });
  }

  stop() {
    this.process.send({ method: 'stop' });
  }
}

function chunkFromParams(params: TestOutputPayload): string | Buffer {
  if (typeof params.text === 'string')
    return params.text;
  return Buffer.from(params.buffer, 'base64');
}
