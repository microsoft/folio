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
import { TestError } from './types';
import { default as minimatch } from 'minimatch';

const FOLIO_DIRS = [__dirname, path.join(__dirname, '..', 'src')];
const cwd = process.cwd();
const stackUtils = new StackUtils({ cwd });

export class DeadlineRunner<T> {
  private _timer: NodeJS.Timer | undefined;
  private _done = false;
  private _fulfill: (t: { result?: T, timedOut?: boolean }) => void;
  private _reject: (error: any) => void;

  readonly result: Promise<{ result?: T, timedOut?: boolean }>;

  constructor(promise: Promise<T>, deadline: number | undefined) {
    this.result = new Promise((f, r) => {
      this._fulfill = f;
      this._reject = r;
    });
    promise.then(result => {
      this._finish({ result });
    }).catch(e => {
      this._finish(undefined, e);
    });
    this.setDeadline(deadline);
  }

  private _finish(success?: { result?: T, timedOut?: boolean }, error?: any) {
    if (this._done)
      return;
    this.setDeadline(undefined);
    if (success)
      this._fulfill(success);
    else
      this._reject(error);
  }

  setDeadline(deadline: number | undefined) {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = undefined;
    }
    if (deadline === undefined)
      return;
    const timeout = deadline - monotonicTime();
    if (timeout <= 0)
      this._finish({ timedOut: true });
    else
      this._timer = setTimeout(() => this._finish({ timedOut: true }), timeout);
  }
}

export async function raceAgainstDeadline<T>(promise: Promise<T>, deadline: number | undefined): Promise<{ result?: T, timedOut?: boolean }> {
  return (new DeadlineRunner(promise, deadline)).result;
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

export function callLocation(fallbackFile: string): {file: string, line: number, column: number} {
  const frames = callFrames();
  if (!frames.length)
    return {file: fallbackFile, line: 1, column: 1};
  const location = stackUtils.parseLine(frames[0]);
  return {
    file: path.resolve(cwd, location.file),
    line: location.line,
    column: location.column,
  };
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

export function prependErrorMessage(e: Error, message: string) {
  let stack = e.stack || '';
  if (stack.includes(e.message))
    stack = stack.substring(stack.indexOf(e.message) + e.message.length);
  let m = e.message;
  if (m.startsWith('Error:'))
    m = m.substring('Error:'.length);
  e.message = message + m;
  e.stack = e.message + stack;
}

export function interpretCondition(arg?: boolean | string, description?: string): { condition: boolean, description?: string } {
  if (arg === undefined && description === undefined)
    return { condition: true };
  if (typeof arg === 'string')
    return { condition: true, description: arg };
  return { condition: !!arg, description };
}

export function createMatcher(patterns: string | RegExp | (string | RegExp)[]): (value: string) => boolean {
  const list = Array.isArray(patterns) ? patterns : [patterns];
  return (value: string) => {
    for (const pattern of list) {
      if (pattern instanceof RegExp || Object.prototype.toString.call(pattern) === '[object RegExp]') {
        (pattern as RegExp).lastIndex = 0;
        if ((pattern as RegExp).test(value))
          return true;
      } else {
        if (minimatch(value, pattern))
          return true;
      }
    }
    return false;
  };
}

export function mergeObjects<A extends object, B extends object>(a: A | undefined | void, b: B | undefined | void): A & B {
  const result = { ...a };
  if (!Object.is(b, undefined)) {
    for (const [name, value] of Object.entries(b as B)) {
      if (!Object.is(value, undefined))
        result[name] = value;
    }
  }
  return result as any;
}
