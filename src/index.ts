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

import type { TestType, CLIOption, BooleanCLIOption, ListCLIOption, StringCLIOption } from './types';
import { rootTestType } from './testType';
import { currentOptionsRegistry } from './globals';
import { errorWithCallLocation } from './util';

// Configuration types.
export type { Project, FullProject, Config, FullConfig } from './types';
// Fixtures types.
export type { TestInfo, WorkerInfo, TestType, Fixtures } from './types';
// Reporter types.
export type { TestStatus, Suite, Spec, Test, TestResult, TestError, Reporter } from './types';

export { expect } from './expect';
export const test: TestType<{}, {}> = rootTestType.test;
export default test;

export function registerCLIOption(name: string, description: string, options: { type: 'boolean' }): BooleanCLIOption;
export function registerCLIOption(name: string, description: string, options: { type: 'list' }): ListCLIOption;
export function registerCLIOption(name: string, description: string, options?: { type?: 'string' }): StringCLIOption;
export function registerCLIOption(name: string, description: string, options?: { type?: 'string' | 'boolean' | 'list' }): CLIOption {
  try {
    const registry = currentOptionsRegistry();
    if (!registry)
      throw new Error(`registerCLIOption() must be called from a configuration file`);
    return registry.registerCLIOption(name, description, options);
  } catch (e) {
    throw errorWithCallLocation(e.message);
  }
}
