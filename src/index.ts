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

import type { TestType, Config, Reporter } from './types';
import { rootTestType, RunList, RunListConfig } from './testType';
import { currentlyLoadingConfigFile } from './globals';
import { errorWithCallLocation } from './util';
import DotReporter from './reporters/dot';
import JSONReporter from './reporters/json';
import JUnitReporter from './reporters/junit';
import LineReporter from './reporters/line';
import ListReporter from './reporters/list';

export * from './types';
export { expect } from './expect';
export const test: TestType<{}, {}, {}, {}, {}, {}> = rootTestType.test;
export const reporters = {
  dot: DotReporter,
  json: JSONReporter,
  junit: JUnitReporter,
  line: LineReporter,
  list: ListReporter,
};

export function setConfig(config: Config) {
  const configFile = currentlyLoadingConfigFile();
  if (!configFile)
    throw errorWithCallLocation(`setConfig() can only be called in a configuration file.`);
  configFile.setConfig(config);
}

export function globalSetup(globalSetupFunction: () => any) {
  const configFile = currentlyLoadingConfigFile();
  if (!configFile)
    throw errorWithCallLocation(`globalSetup() can only be called in a configuration file.`);
  configFile.globalSetup(globalSetupFunction);
}

export function globalTeardown(globalTeardownFunction: () => any) {
  const configFile = currentlyLoadingConfigFile();
  if (!configFile)
    throw errorWithCallLocation(`globalTeardown() can only be called in a configuration file.`);
  configFile.globalTeardown(globalTeardownFunction);
}

export function setReporters(reporters: Reporter[]) {
  const configFile = currentlyLoadingConfigFile();
  if (!configFile)
    throw errorWithCallLocation(`setReporters() can only be called in a configuration file.`);
  configFile.setReporters(reporters);
}

type WorkerOptionsForEnv<T> = T extends TestType<infer T, infer W, infer TO, infer WO, infer DT, infer DW> ? WO : never;
export function runTests<T = typeof test>(config?: RunListConfig<WorkerOptionsForEnv<T>>) {
  const configFile = currentlyLoadingConfigFile();
  if (!configFile)
    throw errorWithCallLocation(`runTests() can only be called in a configuration file.`);
  configFile.addRunList(new RunList(config || {}));
}
