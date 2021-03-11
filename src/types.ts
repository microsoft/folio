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

import type { Expect } from './expectType';

export interface Config {
  forbidOnly?: boolean;
  globalTimeout: number;
  grep?: string;
  maxFailures: number;
  outputDir: string;
  quiet?: boolean;
  repeatEach: number;
  retries: number;
  shard?: { total: number, current: number };
  snapshotDir: string;
  testDir: string;
  timeout: number;
  updateSnapshots: boolean;
  workers: number;
}

export type TestStatus = 'passed' | 'failed' | 'timedOut' | 'skipped';

interface TestModifier {
  skip(): void;
  skip(condition: boolean): void;
  skip(description: string): void;
  skip(condition: boolean, description: string): void;

  fixme(): void;
  fixme(condition: boolean): void;
  fixme(description: string): void;
  fixme(condition: boolean, description: string): void;

  fail(): void;
  fail(condition: boolean): void;
  fail(description: string): void;
  fail(condition: boolean, description: string): void;
}

export interface TestInfo extends TestModifier {
  // Declaration
  title: string;
  file: string;
  line: number;
  column: number;
  fn: Function;

  // Parameters
  options: folio.SuiteOptions;
  variation: folio.SuiteVariation;
  workerIndex: number;
  repeatEachIndex: number;
  retry: number;

  // Modifiers
  expectedStatus: TestStatus;
  timeout: number;
  annotations: any[];

  // Results
  duration: number;
  status?: TestStatus;
  error?: any;
  stdout: (string | Buffer)[];
  stderr: (string | Buffer)[];
  data: any;

  // Paths
  relativeArtifactsPath: string;
  snapshotPath: (...pathSegments: string[]) => string;
  outputPath: (...pathSegments: string[]) => string;
}

interface SuiteFunction {
  (name: string, inner: () => void): void;
}
interface SuiteHookFunction {
  (inner: (fixtures: folio.WorkerFixtures) => Promise<void> | void): void;
}

interface TestFunction {
  (name: string, inner: (fixtures: folio.WorkerFixtures & folio.TestFixtures) => Promise<void> | void): void;
}
interface TestHookFunction {
  (inner: (fixtures: folio.WorkerFixtures & folio.TestFixtures) => Promise<void> | void): void;
}

export interface TestSuiteFunction extends TestFunction, TestModifier {
  only: TestFunction;
  describe: SuiteFunction & {
    only: SuiteFunction;
  };

  beforeEach: TestHookFunction;
  afterEach: TestHookFunction;
  beforeAll: SuiteHookFunction;
  afterAll: SuiteHookFunction;

  expect: Expect;
}

export interface WorkerFixture<R = any> {
  (fixtures: folio.WorkerFixtures, run: (value: R) => Promise<void>): Promise<any>;
}
export interface TestFixture<R = any> {
  (fixtures: folio.WorkerFixtures & folio.TestFixtures, run: (value: R) => Promise<void>): Promise<any>;
}
export interface ToBeRenamedInterface {
  testFixtures?: { [key: string]: TestFixture };
  autoTestFixtures?: { [key: string]: TestFixture };
  workerFixtures?: { [key: string]: WorkerFixture };
  autoWorkerFixtures?: { [key: string]: WorkerFixture };
  configureSuite?: (suite: RootSuite) => any;
}


export interface Suite {
  title: string;
  file: string;
  line: number;
  column: number;
  suites: Suite[];
  specs: Spec[];
  findTest(fn: (test: Test) => boolean | void): boolean;
  findSpec(fn: (spec: Spec) => boolean | void): boolean;
  totalTestCount(): number;
}
export interface Spec {
  title: string;
  file: string;
  line: number;
  column: number;
  tests: Test[];
  fullTitle(): string;
  ok(): boolean;
}
export interface Test {
  spec: Spec;
  variation: folio.SuiteVariation;
  results: TestResult[];
  skipped: boolean;
  expectedStatus: TestStatus;
  timeout: number;
  annotations: any[];
  status(): 'skipped' | 'expected' | 'unexpected' | 'flaky';
  ok(): boolean;
}
export interface TestResult {
  retry: number;
  workerIndex: number,
  duration: number;
  status?: TestStatus;
  error?: TestError;
  stdout: (string | Buffer)[];
  stderr: (string | Buffer)[];
  data: any;
}
export interface TestError {
  message?: string;
  stack?: string;
  value?: string;
}
export interface RootSuite extends Suite {
  options: folio.SuiteOptions;
  variations: folio.SuiteVariation[];
  vary<K extends keyof folio.SuiteVariation>(key: K, values: folio.SuiteVariation[K][]): void;
}

declare global {
  namespace folio {
    // Fixtures initialized once per worker, available to any hooks and tests.
    interface WorkerFixtures {
      // Worker index that runs this test, built-in Folio fixture.
      testWorkerIndex: number;
    }

    // Fixtures initialized once per test, available to any test.
    interface TestFixtures {
      // Information about the test being run, built-in Folio fixture.
      testInfo: TestInfo;
    }

    // Options that can be passed to createTest().
    interface SuiteOptions {
      // Relative path, empty by default, built-in Folio option.
      testPathSegment?: string;
    }

    // A bag of key/value properties. Tests may be run multiple times, with some combinations of these properties.
    interface SuiteVariation {
    }
  }
}
