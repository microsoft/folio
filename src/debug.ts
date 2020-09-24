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

import { debug as debugImpl } from 'debug';

let workerIndex: number | undefined;

export function setDebugWorkerIndex(index: number) {
  workerIndex = index;
}

export const debugLog = (message: string, ...args: any[]) => {
  if (workerIndex === undefined)
    debugImpl('pwr:runner')(message, ...args);
  else
    debugImpl(`pwr:worker[${workerIndex}]`)(message, ...args);
};
