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

import type { Config, Reporter, TestInfo } from './types';
import type { RunList } from './testType';
import { errorWithCallLocation } from './util';
import { Suite } from './test';

let currentTestInfoValue: TestInfo | null = null;
export function setCurrentTestInfo(testInfo: TestInfo | null) {
  currentTestInfoValue = testInfo;
}
export function currentTestInfo(): TestInfo | null {
  return currentTestInfoValue;
}

let currentFileSuite: Suite | undefined;
export function setCurrentlyLoadingFileSuite(suite: Suite | undefined) {
  currentFileSuite = suite;
}
export function currentlyLoadingFileSuite() {
  return currentFileSuite;
}

export interface ConfigFileAPI {
  setConfig(config: Config): void;
  globalSetup(globalSetupFunction: () => any): void;
  globalTeardown(globalTeardownFunction: () => any): void;
  setReporters(reporters: Reporter[]): void;
  addRunList(runList: RunList): void;
}

let configFile: ConfigFileAPI | undefined;
export function setCurrentlyLoadingConfigFile(file: ConfigFileAPI | undefined) {
  configFile = file;
}
export function currentlyLoadingConfigFile() {
  return configFile;
}

export function setConfig(config: Config) {
  if (!configFile)
    throw errorWithCallLocation(`setConfig() can only be called in a configuration file.`);
  configFile.setConfig(config);
}

export function globalSetup(globalSetupFunction: () => any) {
  if (!configFile)
    throw errorWithCallLocation(`globalSetup() can only be called in a configuration file.`);
  configFile.globalSetup(globalSetupFunction);
}

export function globalTeardown(globalTeardownFunction: () => any) {
  if (!configFile)
    throw errorWithCallLocation(`globalTeardown() can only be called in a configuration file.`);
  configFile.globalTeardown(globalTeardownFunction);
}

export function setReporters(reporters: Reporter[]) {
  if (!configFile)
    throw errorWithCallLocation(`setReporters() can only be called in a configuration file.`);
  configFile.setReporters(reporters);
}
