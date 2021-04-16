/**
 * Copyright 2019 Google Inc. All rights reserved.
 * Modifications copyright (c) Microsoft Corporation.
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

import type { Env, TestType } from './types';
import { newTestTypeImpl, mergeEnvsImpl } from './spec';
import DotReporter from './reporters/dot';
import JSONReporter from './reporters/json';
import JUnitReporter from './reporters/junit';
import LineReporter from './reporters/line';
import ListReporter from './reporters/list';

export * from './types';
export { expect } from './expect';
export { setConfig, setReporters, globalSetup, globalTeardown } from './spec';

export function newTestType<TestArgs = {}, TestOptions = {}>(): TestType<TestArgs, TestOptions, TestArgs> {
  return newTestTypeImpl([]);
}

export function merge<TestArgs>(env: Env<TestArgs>): Env<TestArgs>;
export function merge<TestArgs1, TestArgs2>(env1: Env<TestArgs1>, env2: Env<TestArgs2>): Env<TestArgs1 & TestArgs2>;
export function merge<TestArgs1, TestArgs2, TestArgs3>(env1: Env<TestArgs1>, env2: Env<TestArgs2>, env3: Env<TestArgs3>): Env<TestArgs1 & TestArgs2 & TestArgs3>;
export function merge(...envs: any): Env<any> {
  return mergeEnvsImpl(envs);
}

export const reporters = {
  dot: DotReporter,
  json: JSONReporter,
  junit: JUnitReporter,
  line: LineReporter,
  list: ListReporter,
};
