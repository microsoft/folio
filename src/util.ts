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

const FOLIO_DIRS = [__dirname, path.join(__dirname, '..', 'src')];
const cwd = process.cwd();
const stackUtils = new StackUtils({ cwd });

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

function callFrames(): string[] {
  const obj = { stack: '' };
  Error.captureStackTrace(obj);
  const frames = obj.stack.split('\n').slice(1);
  while (frames.length && FOLIO_DIRS.some(dir => frames[0].includes(dir)))
    frames.shift();
  return frames;
}

export function callLocation(): string {
  const frames = callFrames();
  if (!frames.length)
    return '';
  const location = stackUtils.parseLine(frames[0]);
  return `${path.resolve(cwd, location.file)}:${location.line}:${location.column}`;
}

export function errorWithCallLocation(message: string): Error {
  const frames = callFrames();
  const error = new Error(message);
  error.stack = 'Error: ' + message + '\n' + frames.join('\n');
  return error;
}

export function monotonicTime(): number {
  const [seconds, nanoseconds] = process.hrtime();
  return seconds * 1000 + (nanoseconds / 1000000 | 0);
}
