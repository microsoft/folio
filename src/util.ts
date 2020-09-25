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

export async function raceAgainstTimeout<T>(promise: Promise<T>, deadline: number): Promise<{ result?: T, timedOut?: boolean }> {
  if (!deadline)
    return { result: await promise };

  const timeout = deadline - Date.now();
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
  const location = error.stack.split('\n')[3];
  const match = location.match(/Object.<anonymous> \((.*)\)/);
  if (match)
    return match[1];
  return '';
}
