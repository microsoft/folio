/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as path from 'path';
import StackUtils from 'stack-utils';

const stackUtils = new StackUtils();

export async function raceAgainstDeadline<T>(promise: Promise<T>, deadline: number): Promise<{ result?: T, timedOut?: boolean }> {
  if (!deadline)
    return { result: await promise };

  const timeout = deadline - monotonicTime();
  if (timeout <= 0)
    return { timedOut: true };

  let timer: NodeJS.Timer;
  let done = false;
  let fulfill: (t: { result?: T, timedOut?: boolean }) => void;
  let reject: (e: Error) => void;
  const result = new Promise((f, r) => {
    fulfill = f;
    reject = r;
  });
  setTimeout(() => {
    done = true;
    fulfill({ timedOut: true });
  }, timeout);
  promise.then(result => {
    clearTimeout(timer);
    if (!done) {
      done = true;
      fulfill({ result });
    }
  }).catch(e => {
    clearTimeout(timer);
    if (!done)
      reject(e);
  });
  return result;
}

export function serializeError(error: Error | any): any {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack
    };
  }
  return trimCycles(error);
}

function trimCycles(obj: any): any {
  const cache = new Set();
  return JSON.parse(
      JSON.stringify(obj, function(key, value) {
        if (typeof value === 'object' && value !== null) {
          if (cache.has(value))
            return '' + value;
          cache.add(value);
        }
        return value;
      })
  );
}

export function extractLocation(error: Error): string {
  const location = stackUtils.parseLine(error.stack.split('\n')[3]);
  return `${path.resolve(process.cwd(), location.file)}:${location.line}:${location.column}`;
}

export function monotonicTime(): number {
  const [seconds, nanoseconds] = process.hrtime();
  return seconds * 1000 + (nanoseconds / 1000000 | 0);
}

export function callerFile(caller: Function, stackFrameIndex: number): string {
  const obj = { stack: '' };
  // disable source-map-support to match the locations seen in require.cache
  const origPrepare = Error.prepareStackTrace;
  Error.prepareStackTrace = null;
  Error.captureStackTrace(obj, caller);
  // v8 doesn't actually prepare the stack trace until we access it
  obj.stack;
  Error.prepareStackTrace = origPrepare;
  let stackFrame = obj.stack.split('\n')[stackFrameIndex].trim();
  if (stackFrame.startsWith('at '))
    stackFrame = stackFrame.substring(3);
  if (stackFrame.includes('('))
    stackFrame = stackFrame.match(/\((.*)\)/)[1];
  return stackFrame.replace(/^(.+):\d+:\d+$/, '$1');
}
