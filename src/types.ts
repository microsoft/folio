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
  globalTimeout?: number;
  grep?: RegExp | RegExp[];
  maxFailures?: number;
  outputDir?: string;
  repeatEach?: number;
  retries?: number;
  quiet?: boolean;
  shard?: { total: number, current: number } | null;
  snapshotDir?: string;
  testDir?: string;
  testIgnore?: string | RegExp | (string | RegExp)[];
  testMatch?: string | RegExp | (string | RegExp)[];
  timeout?: number;
  updateSnapshots?: boolean;
  workers?: number;
}
export type FullConfig = Required<Config>;

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

  slow(): void;
  slow(condition: boolean): void;
  slow(description: string): void;
  slow(condition: boolean, description: string): void;

  setTimeout(timeout: number): void;
}

export type TestStatus = 'passed' | 'failed' | 'timedOut' | 'skipped';

export interface WorkerInfo {
  config: FullConfig;
  workerIndex: number;
}

export interface TestInfo extends WorkerInfo, TestModifier {
  // Declaration
  title: string;
  file: string;
  line: number;
  column: number;
  fn: Function;

  // Modifiers
  expectedStatus: TestStatus;
  timeout: number;
  annotations: { type: string, description?: string }[];
  repeatEachIndex: number;
  retry: number;

  // Results
  duration: number;
  status?: TestStatus;
  error?: any;
  stdout: (string | Buffer)[];
  stderr: (string | Buffer)[];
  data: { [key: string]: any };

  // Paths
  snapshotPathSegment: string;
  outputDir: string;
  snapshotPath: (...pathSegments: string[]) => string;
  outputPath: (...pathSegments: string[]) => string;
}

interface SuiteFunction {
  (name: string, inner: () => void): void;
}

interface TestFunction<TestArgs> {
  (name: string, inner: (args: TestArgs, testInfo: TestInfo) => Promise<void> | void): void;
}

export interface TestType<TestArgs, WorkerArgs, TestOptions, WorkerOptions> extends TestFunction<TestArgs>, TestModifier {
  only: TestFunction<TestArgs>;
  describe: SuiteFunction & {
    only: SuiteFunction;
  };

  beforeEach(inner: (args: TestArgs, testInfo: TestInfo) => Promise<any> | any): void;
  afterEach(inner: (args: TestArgs, testInfo: TestInfo) => Promise<any> | any): void;
  beforeAll(inner: (args: WorkerArgs, workerInfo: WorkerInfo) => Promise<any> | any): void;
  afterAll(inner: (args: WorkerArgs, workerInfo: WorkerInfo) => Promise<any> | any): void;
  useOptions(options: TestOptions): void;

  expect: Expect;

  extend(): TestType<TestArgs, WorkerArgs, TestOptions, WorkerOptions>;
  extend<T, W, TO, WO>(env: Env<T, W, TO, WO, TestArgs & TestOptions, WorkerArgs & WorkerOptions>): TestType<TestArgs & T, WorkerArgs & W, TestOptions & TO, WorkerOptions & WO>;
  // TODO: use Declared{Test,Worker}Args so that runWith also implements T and W.
  declare<T = {}, W = {}>(): TestType<TestArgs & T, WorkerArgs & W, TestOptions, WorkerOptions>;

  runWith(envAndConfig: EnvAndConfig<TestOptions, WorkerOptions>): void;
  runWith(env: Env<TestOptions, WorkerOptions>, config: RunWithConfig<WorkerOptions>): void;
}

export type RunWithConfig<WorkerArgs> = {
  options?: WorkerArgs;
  outputDir?: string;
  repeatEach?: number;
  retries?: number;
  tag?: string | string[];
  timeout?: number;
};

type EnvAndConfig<TestArgs, WorkerArgs> =
  {} extends TestArgs
  ? ({} extends WorkerArgs
    ? Env<TestArgs, WorkerArgs> & RunWithConfig<WorkerArgs> | void
    : Env<TestArgs, WorkerArgs> & RunWithConfig<WorkerArgs>)
  : Env<TestArgs, WorkerArgs> & RunWithConfig<WorkerArgs>;
type MaybePromise<T> = T | Promise<T>;
type MaybeVoid<T> = {} extends T ? (T | void) : T;
type RemovePromise<T> = T extends Promise<infer R> ? R : T;

export interface Env<TestArgs = {}, WorkerArgs = {}, TestOptions = {}, WorkerOptions = {}, PreviousTestArgs = {}, PreviousWorkerArgs = {}> {
  // For type inference.
  testOptionsType?(): TestOptions;
  optionsType?(): WorkerOptions;

  // Implementation.
  beforeEach?(args: PreviousTestArgs & TestOptions, testInfo: TestInfo): MaybePromise<MaybeVoid<TestArgs>>;
  beforeAll?(args: PreviousWorkerArgs & WorkerOptions, workerInfo: WorkerInfo): MaybePromise<MaybeVoid<WorkerArgs>>;
  afterEach?(args: this['beforeEach'] extends undefined ? TestArgs : RemovePromise<ReturnType<Exclude<this['beforeEach'], undefined>>>, testInfo: TestInfo): MaybePromise<any>;
  afterAll?(args: this['beforeAll'] extends undefined ? WorkerArgs : RemovePromise<ReturnType<Exclude<this['beforeAll'], undefined>>>, workerInfo: WorkerInfo): MaybePromise<any>;
}

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
  annotations: { type: string, description?: string }[];
  tags: string[];
  retries: number;
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
  data: { [key: string]: any };
}
export interface TestError {
  message?: string;
  stack?: string;
  value?: string;
}
export interface Reporter {
  onBegin(config: FullConfig, suite: Suite): void;
  onTestBegin(test: Test): void;
  onStdOut(chunk: string | Buffer, test?: Test): void;
  onStdErr(chunk: string | Buffer, test?: Test): void;
  onTestEnd(test: Test, result: TestResult): void;
  onTimeout(timeout: number): void;
  onError(error: TestError): void;
  onEnd(): void;
}
