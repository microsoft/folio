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

import { Console } from 'console';
import * as util from 'util';
import { debugLog, setDebugWorkerIndex } from './debug';
import { envAfterAll, envAfterEach, setCurrentWorkerIndex } from './env';
import { RunPayload, TestOutputPayload, WorkerInitParams } from './ipc';
import { Loader } from './loader';
import { serializeError } from './util';
import { WorkerRunner } from './workerRunner';

let closed = false;

sendMessageToParent('ready');

global.console = new Console({
  stdout: process.stdout,
  stderr: process.stderr,
  colorMode: process.env.FORCE_COLOR === '1',
});

process.stdout.write = chunk => {
  const outPayload: TestOutputPayload = {
    testId: testRunner ? testRunner._testId : undefined,
    ...chunkToParams(chunk)
  };
  sendMessageToParent('stdOut', outPayload);
  return true;
};

if (!process.env.PW_RUNNER_DEBUG) {
  process.stderr.write = chunk => {
    const outPayload: TestOutputPayload = {
      testId: testRunner ? testRunner._testId : undefined,
      ...chunkToParams(chunk)
    };
    sendMessageToParent('stdErr', outPayload);
    return true;
  };
}

process.on('disconnect', gracefullyCloseAndExit);
process.on('SIGINT',() => {});
process.on('SIGTERM',() => {});

let testRunner: WorkerRunner;
let initParams: WorkerInitParams;
let loader: Loader;
let loaderInitialized = false;

process.on('unhandledRejection', (reason, promise) => {
  if (testRunner)
    testRunner.unhandledError(reason);
});

process.on('uncaughtException', error => {
  if (testRunner)
    testRunner.unhandledError(error);
});

process.on('message', async message => {
  if (message.method === 'init') {
    initParams = message.params as WorkerInitParams;
    setDebugWorkerIndex(initParams.workerIndex);
    setCurrentWorkerIndex(initParams.workerIndex);
    loader = new Loader();
    debugLog(`init`, initParams);
    return;
  }
  if (message.method === 'stop') {
    debugLog(`stopping...`);
    await gracefullyCloseAndExit();
    debugLog(`stopped`);
    return;
  }
  if (message.method === 'run') {
    const runPayload = message.params as RunPayload;
    debugLog(`run`, runPayload);
    // TODO: perhaps make a single instance of WorkerRunner per worker?
    testRunner = new WorkerRunner(loader, initParams.repeatEachIndex, initParams.suiteTitle, runPayload);
    for (const event of ['testBegin', 'testEnd', 'done'])
      testRunner.on(event, sendMessageToParent.bind(null, event));
    if (!loaderInitialized) {
      // Initialize after creating WorkerRunner, just in case we encounter errors while loading.
      loaderInitialized = true;
      loader.deserialize(initParams.loader);
    }
    await testRunner.run();
    testRunner = null;
  }
});

async function gracefullyCloseAndExit() {
  if (closed)
    return;
  closed = true;
  // Force exit after 30 seconds.
  const shutdownTimeout = +(process.env.FOLIO_TEST_SHUTDOWN_TIMEOUT || 30000);
  setTimeout(() => process.exit(0), shutdownTimeout);
  // Meanwhile, try to gracefully shutdown.
  if (testRunner)
    testRunner.stop();
  try {
    await envAfterEach();
    await envAfterAll();
  } catch (e) {
    process.send({ method: 'teardownError', params: { error: serializeError(e) } });
  }
  process.exit(0);
}

function sendMessageToParent(method, params = {}) {
  try {
    if (method !== 'ready')
      debugLog(`send`, { method, params });
    process.send({ method, params });
  } catch (e) {
    // Can throw when closing.
  }
}

function chunkToParams(chunk: Buffer | string):  { text?: string, buffer?: string } {
  if (chunk instanceof Buffer)
    return { buffer: chunk.toString('base64') };
  if (typeof chunk !== 'string')
    return { text: util.inspect(chunk) };
  return { text: chunk };
}
