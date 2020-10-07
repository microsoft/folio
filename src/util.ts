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

import path from 'path';
import util from 'util';
import StackUtils from 'stack-utils';
import { TestError } from './ipc';

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

export function serializeError(error: Error | any): TestError {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack
    };
  }
  return {
    value: util.inspect(error)
  };
}

export function extractLocation(error: Error): string {
  const location = stackUtils.parseLine(error.stack.split('\n')[3]);
  return `${path.resolve(process.cwd(), location.file)}:${location.line}:${location.column}`;
}

export function monotonicTime(): number {
  const [seconds, nanoseconds] = process.hrtime();
  return seconds * 1000 + (nanoseconds / 1000000 | 0);
}
