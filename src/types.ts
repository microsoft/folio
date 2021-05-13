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

export type ReporterDescription =
  'dot' |
  'line' |
  'list' |
  'junit' | { name: 'junit', outputFile?: string, stripANSIControlSequences?: boolean } |
  'json' | { name: 'json', outputFile?: string } |
  'null' |
  string;

export type Shard = { total: number, current: number } | null;
export type PreserveOutput = 'always' | 'never' | 'failures-only';
export type UpdateSnapshots = 'all' | 'none' | 'missing';

type EnvDefine = { test: TestType<any, any, any>, env: Env };

export interface Project<Options = {}> {
  define?: EnvDefine | EnvDefine[];
  options?: Options;
  outputDir?: string;
  repeatEach?: number;
  retries?: number;
  snapshotDir?: string;
  name?: string;
  testDir?: string;
  testIgnore?: string | RegExp | (string | RegExp)[];
  testMatch?: string | RegExp | (string | RegExp)[];
  timeout?: number;
}
export type FullProject<Options = {}> = Required<Project<Options>>;

export interface Config<Options = {}> extends Project<Options> {
  forbidOnly?: boolean;
  globalSetup?: string | null;
  globalTeardown?: string | null;
  globalTimeout?: number;
  grep?: RegExp | RegExp[];
  maxFailures?: number;
  preserveOutput?: PreserveOutput;
  projects?: Project[];
  reporter?: ReporterDescription | ReporterDescription[];
  quiet?: boolean;
  shard?: Shard;
  updateSnapshots?: UpdateSnapshots;
  workers?: number;
}

export interface FullConfig {
  forbidOnly: boolean;
  globalSetup: string | null;
  globalTeardown: string | null;
  globalTimeout: number;
  grep: RegExp | RegExp[];
  maxFailures: number;
  preserveOutput: PreserveOutput;
  reporter: ReporterDescription[];
  rootDir: string;
  quiet: boolean;
  shard: Shard;
  updateSnapshots: UpdateSnapshots;
  workers: number;
}

export interface ConfigOverrides {
  forbidOnly?: boolean;
  globalTimeout?: number;
  grep?: RegExp | RegExp[];
  maxFailures?: number;
  repeatEach?: number;
  outputDir?: string;
  preserveOutput?: PreserveOutput;
  retries?: number;
  reporter?: ReporterDescription[];
  quiet?: boolean;
  shard?: Shard;
  timeout?: number;
  updateSnapshots?: UpdateSnapshots;
  workers?: number;
}

interface TestModifier<TestArgs> {
  skip(): void;
  skip(description: string): void;
  skip(condition: boolean): void;
  skip(condition: boolean, description: string): void;
  skip(callback: (args: TestArgs) => boolean): void;
  skip(callback: (args: TestArgs) => boolean, description: string): void;

  fixme(): void;
  fixme(description: string): void;
  fixme(condition: boolean): void;
  fixme(condition: boolean, description: string): void;
  fixme(callback: (args: TestArgs) => boolean): void;
  fixme(callback: (args: TestArgs) => boolean, description: string): void;

  fail(): void;
  fail(description: string): void;
  fail(condition: boolean): void;
  fail(condition: boolean, description: string): void;
  fail(callback: (args: TestArgs) => boolean): void;
  fail(callback: (args: TestArgs) => boolean, description: string): void;

  slow(): void;
  slow(description: string): void;
  slow(condition: boolean): void;
  slow(condition: boolean, description: string): void;
  slow(callback: (args: TestArgs) => boolean): void;
  slow(callback: (args: TestArgs) => boolean, description: string): void;

  setTimeout(timeout: number): void;
}

export type TestStatus = 'passed' | 'failed' | 'timedOut' | 'skipped';

export interface WorkerInfo {
  config: FullConfig;
  project: FullProject;
  workerIndex: number;
}

export interface TestInfo extends WorkerInfo, TestModifier<{}> {
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

export interface TestType<TestArgs, WorkerArgs, Options> extends TestFunction<TestArgs>, TestModifier<TestArgs> {
  only: TestFunction<TestArgs>;
  describe: SuiteFunction & {
    only: SuiteFunction;
  };

  beforeEach(inner: (args: TestArgs, testInfo: TestInfo) => Promise<any> | any): void;
  afterEach(inner: (args: TestArgs, testInfo: TestInfo) => Promise<any> | any): void;
  beforeAll(inner: (args: WorkerArgs, workerInfo: WorkerInfo) => Promise<any> | any): void;
  afterAll(inner: (args: WorkerArgs, workerInfo: WorkerInfo) => Promise<any> | any): void;
  useOptions(options: Options): void;

  expect: Expect;

  extend(): TestType<TestArgs, WorkerArgs, Options>;
  extend<T, W, O>(env: Env<T, W, O, TestArgs & Options, WorkerArgs & Options>): TestType<TestArgs & T & W, WorkerArgs & W, Options & O>;
  declare<T = {}, W = {}, O = {}>(): TestType<TestArgs & T & W, WorkerArgs & W, Options & O>;
}

type MaybePromise<T> = T | Promise<T>;
type MaybeVoid<T> = {} extends T ? T | void : T;

export interface Env<TestArgs = {}, WorkerArgs = {}, Options = {}, PreviousTestArgs = {}, PreviousWorkerArgs = {}> {
  hasBeforeAllOptions?(options: Options): boolean;
  beforeEach?(args: PreviousTestArgs & Options, testInfo: TestInfo): MaybePromise<MaybeVoid<TestArgs>>;
  beforeAll?(args: PreviousWorkerArgs & Options, workerInfo: WorkerInfo): MaybePromise<MaybeVoid<WorkerArgs>>;
  afterEach?(args: PreviousTestArgs & Options, testInfo: TestInfo): MaybePromise<any>;
  afterAll?(args: PreviousWorkerArgs & Options, workerInfo: WorkerInfo): MaybePromise<any>;
}

export interface BooleanCLIOption {
  name: string;
  description: string;
  type: 'boolean';
  value?: boolean;
}
export interface StringCLIOption {
  name: string;
  description: string;
  type: 'string';
  value?: string;
}
export interface ListCLIOption {
  name: string;
  description: string;
  type: 'list';
  value?: string[];
}
export type CLIOption = BooleanCLIOption | StringCLIOption | ListCLIOption;

// ---------- Reporters API -----------

export interface Suite {
  title: string;
  file: string;
  line: number;
  column: number;
  suites: Suite[];
  specs: Spec[];
  fullTitle(): string;
  findTest(fn: (test: Test) => boolean | void): boolean;
  findSpec(fn: (spec: Spec) => boolean | void): boolean;
  totalTestCount(): number;
}
export interface Spec {
  suite: Suite;
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
  projectName: string;
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
