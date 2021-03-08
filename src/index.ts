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

import type { TestModifier } from './testModifier';
import { expect } from './expect';
import type { TestInfo } from './fixtures';
import { createTestImpl } from './spec';

declare global {
  namespace folio {
    interface SuiteOptions {}
    interface SuiteVariation {}
    interface WorkerFixtures {}
    interface TestFixtures {}
  }
}

interface SuiteFunction {
  (name: string, inner: () => void): void;
  (name: string, modifierFn: (modifier: TestModifier, variation: folio.SuiteVariation) => any, inner: () => void): void;
}
interface SuiteFunctionWithModifiers extends SuiteFunction {
  only: SuiteFunction;
  skip: SuiteFunction;
}
interface SuiteHookFunction {
  (inner: (fixtures: folio.WorkerFixtures) => Promise<void> | void): void;
}

interface TestFunction {
  (name: string, inner: (fixtures: folio.WorkerFixtures & folio.TestFixtures) => Promise<void> | void): void;
  (name: string, modifierFn: (modifier: TestModifier, variation: folio.SuiteVariation) => any, inner: (fixtures: folio.WorkerFixtures & folio.TestFixtures) => Promise<void> | void): void;
}
interface TestHookFunction {
  (inner: (fixtures: folio.WorkerFixtures & folio.TestFixtures) => Promise<void> | void): void;
}

interface TestSuiteFunction extends TestFunction {
  only: TestFunction;
  skip: TestFunction;
  beforeEach: TestHookFunction;
  afterEach: TestHookFunction;
  describe: SuiteFunctionWithModifiers;
  beforeAll: SuiteHookFunction;
  afterAll: SuiteHookFunction;
  expect: typeof expect;
}

export type { Config } from './config';
export type { TestInfo } from './fixtures';
export { config, currentTestInfo } from './fixtures';
export { expect } from './expect';

export interface WorkerFixture<R = any> {
  (fixtures: folio.WorkerFixtures, run: (value: R) => Promise<void>): Promise<any>;
}
export interface TestFixture<R = any> {
  (fixtures: folio.WorkerFixtures & folio.TestFixtures, run: (value: R) => Promise<void>): Promise<any>;
}

export function createTest(options: folio.SuiteOptions): TestSuiteFunction {
  return createTestImpl(options);
}

declare global {
  namespace folio {
    // Built-in Folio fixtures

    interface WorkerFixtures {
      // Worker index that runs this test.
      testWorkerIndex: number;
    }

    interface TestFixtures {
      // Information about the test being run.
      testInfo: TestInfo;

      // Parameter-based relative path to be overridden, empty by default.
      testParametersPathSegment: string;  // Note: it is impossible to configure this one.
    }
  }
}
