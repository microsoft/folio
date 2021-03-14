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
  fixtureIgnore: string;
  fixtureMatch: string;
  fixtureOptions: folio.FixtureOptions;
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
  testIgnore: string;
  testMatch: string;
  timeout: number;
  updateSnapshots: boolean;
  workers: number;
}
export type PartialConfig = Partial<Config>;

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

export interface TestInfo {
  // Declaration
  title: string;
  file: string;
  line: number;
  column: number;
  fn: Function;

  // Parameters
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

type OptionsForFixture<K extends string> = K extends keyof folio.FixtureOptions ? folio.FixtureOptions[K] : void;
interface RunFixtureFunction<R> extends TestModifier {
  (value: R): Promise<void>;
}
export interface WorkerFixture<K extends keyof folio.WorkerFixtures> {
  (fixtures: folio.WorkerFixtures, run: RunFixtureFunction<folio.WorkerFixtures[K]>, options?: OptionsForFixture<K>): Promise<any>;
}
export interface TestFixture<K extends keyof folio.TestFixtures> {
  (fixtures: folio.WorkerFixtures & folio.TestFixtures, run: RunFixtureFunction<folio.TestFixtures[K]>, options?: OptionsForFixture<K>): Promise<any>;
}
export interface ToBeRenamedInterface {
  testFixtures?: { [K in keyof folio.TestFixtures]?: TestFixture<K> };
  autoTestFixtures?: { [K in keyof folio.TestFixtures]?: TestFixture<K> };
  workerFixtures?: { [K in keyof folio.WorkerFixtures]?: WorkerFixture<K> };
  autoWorkerFixtures?: { [K in keyof folio.WorkerFixtures]?: WorkerFixture<K> };
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
    interface FixtureOptions {
      // Relative path, empty by default, built-in Folio option.
      testPathSegment?: string;
    }
  }
}
