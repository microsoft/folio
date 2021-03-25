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

import { Env, TestInfo } from './types';

let currentTestInfoValue: TestInfo | null = null;
export function setCurrentTestInfo(testInfo: TestInfo | null) {
  currentTestInfoValue = testInfo;
}
export function currentTestInfo(): TestInfo | null {
  return currentTestInfoValue;
}

let workerIndex: number = 0;
export function setCurrentWorkerIndex(index: number) {
  workerIndex = index;
}
export function currentWorkerIndex() {
  return workerIndex;
}

let currentEnv: Env<any> | undefined = undefined;
let didRunBeforeAll = false;
let didRunBeforeEach = false;
export function setCurrentEnv(env: Env<any>) {
  currentEnv = env;
  didRunBeforeAll = false;
  didRunBeforeEach = false;
}

export async function envBeforeAll() {
  if (currentEnv && currentEnv.beforeAll)
    await currentEnv.beforeAll({ workerIndex: currentWorkerIndex() });
  didRunBeforeAll = true;
}
export async function envBeforeEach() {
  let result: any = {};
  if (currentEnv && currentEnv.beforeEach)
    result = await currentEnv.beforeEach(currentTestInfo());
  didRunBeforeEach = true;
  return result;
}
export async function envAfterEach() {
  if (didRunBeforeEach && currentEnv && currentEnv.afterEach)
    await currentEnv.afterEach(currentTestInfo());
  didRunBeforeEach = false;
}
export async function envAfterAll() {
  if (didRunBeforeAll && currentEnv && currentEnv.afterAll)
    await currentEnv.afterAll({ workerIndex: currentWorkerIndex() });
  didRunBeforeAll = false;
}

