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
  // TODO: change grep to be a RegExp instance, glob pattern or array.
  grep?: string;
  maxFailures: number;
  outputDir: string;
  quiet?: boolean;
  repeatEach: number;
  retries: number;
  shard?: { total: number, current: number };
  snapshotDir: string;
  testDir: string;
  // TODO: change testIgnore to be a RegExp instance, glob pattern or array.
  testIgnore: string;
  // TODO: change testMatch to be a RegExp instance, glob pattern or array.
  testMatch: string;
  timeout: number;
  updateSnapshots: boolean;
  workers: number;
}
// TODO: make Config partial and FullConfig=Required<Config>.
export type PartialConfig = Partial<Config>;

export type TestStatus = 'passed' | 'failed' | 'timedOut' | 'skipped';

export interface WorkerInfo {
  workerIndex: number;
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
  config: Config;
  testOptions: any; // TODO: make testOptions typed.

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

interface TestFunction<TestArgs, TestOptions> {
  (name: string, inner: (args: TestArgs, testInfo: TestInfo) => Promise<void> | void): void;
  (name: string, options: TestOptions, fn: (args: TestArgs, testInfo: TestInfo) => any): void;
}

export interface Tests<TestArgs, TestOptions> extends TestFunction<TestArgs, TestOptions> {
  only: TestFunction<TestArgs, TestOptions>;
  describe: SuiteFunction & {
    only: SuiteFunction;
  };

  beforeEach: (inner: (args: TestArgs, testInfo: TestInfo) => Promise<void> | void) => void;
  afterEach: (inner: (args: TestArgs, testInfo: TestInfo) => Promise<void> | void) => void;
  beforeAll: (inner: (workerInfo: WorkerInfo) => Promise<void> | void) => void;
  afterAll: (inner: (workerInfo: WorkerInfo) => Promise<void> | void) => void;

  expect: Expect;

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

  runWith(options?: { timeout?: number; title?: string }): TestSuite;
  runWith(env: Env<TestArgs>, options?: { timeout?: number; title?: string }): TestSuite;
  runWith<TestArgs1, TestArgs2>(env1: Env<TestArgs1>, env2: Env<TestArgs2>, options?: { timeout?: number; title?: string }): TestSuiteOrNever<TestArgs, TestArgs1 & TestArgs2>;
  runWith<TestArgs1, TestArgs2, TestArgs3>(env1: Env<TestArgs1>, env2: Env<TestArgs2>, env3: Env<TestArgs3>, options?: { timeout?: number; title?: string }): TestSuiteOrNever<TestArgs, TestArgs1 & TestArgs2 & TestArgs3>;
}

export interface Env<TestArgs> {
  beforeAll?(workerInfo: WorkerInfo): Promise<any>;
  beforeEach?(testInfo: TestInfo): Promise<TestArgs>;
  afterEach?(testInfo: TestInfo): Promise<any>;
  afterAll?(workerInfo: WorkerInfo): Promise<any>;
}

interface TestSuite {
  // This is just a tag type - we do not expose what's inside.
}
type TestSuiteOrNever<ExpectedTestArgs, CombinedTestArgs> = CombinedTestArgs extends ExpectedTestArgs ? TestSuite : never;

// ---------- Reporters API -----------

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
  suiteTitle: string;
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
