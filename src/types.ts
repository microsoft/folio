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

type FixtureDefine<TestArgs extends KeyValue = {}, WorkerArgs extends KeyValue = {}> = { test: TestType<TestArgs, WorkerArgs>, fixtures: Fixtures<{}, {}, TestArgs, WorkerArgs> };

export interface Project<TestArgs = {}, WorkerArgs = {}> {
  define?: FixtureDefine | FixtureDefine[];
  outputDir?: string;
  repeatEach?: number;
  retries?: number;
  snapshotDir?: string;
  name?: string;
  testDir?: string;
  testIgnore?: string | RegExp | (string | RegExp)[];
  testMatch?: string | RegExp | (string | RegExp)[];
  timeout?: number;
  use?: Fixtures<{}, {}, TestArgs, WorkerArgs>;
}
export type FullProject<TestArgs = {}, WorkerArgs = {}> = Required<Project<TestArgs, WorkerArgs>>;

export interface Config<TestArgs = {}, WorkerArgs = {}> extends Project<TestArgs, WorkerArgs> {
  forbidOnly?: boolean;
  globalSetup?: string | null;
  globalTeardown?: string | null;
  globalTimeout?: number;
  grep?: RegExp | RegExp[];
  maxFailures?: number;
  preserveOutput?: PreserveOutput;
  projects?: Project<TestArgs, WorkerArgs>[];
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

export type TestStatus = 'passed' | 'failed' | 'timedOut' | 'skipped';

export interface WorkerInfo {
  config: FullConfig;
  project: FullProject;
  workerIndex: number;
}

export interface TestInfo extends WorkerInfo {
  // Declaration
  title: string;
  file: string;
  line: number;
  column: number;
  fn: Function;

  // Modifiers
  skip(description?: string): void;
  fixme(description?: string): void;
  fail(description?: string): void;
  slow(description?: string): void;
  setTimeout(timeout: number): void;

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

export interface TestType<TestArgs extends KeyValue, WorkerArgs extends KeyValue> extends TestFunction<TestArgs & WorkerArgs> {
  only: TestFunction<TestArgs & WorkerArgs>;
  describe: SuiteFunction & {
    only: SuiteFunction;
  };

  skip(): void;
  skip(condition: boolean): void;
  skip(condition: boolean, description: string): void;
  skip(callback: (args: TestArgs & WorkerArgs) => boolean): void;
  skip(callback: (args: TestArgs & WorkerArgs) => boolean, description: string): void;

  fixme(): void;
  fixme(condition: boolean): void;
  fixme(condition: boolean, description: string): void;
  fixme(callback: (args: TestArgs & WorkerArgs) => boolean): void;
  fixme(callback: (args: TestArgs & WorkerArgs) => boolean, description: string): void;

  fail(): void;
  fail(condition: boolean): void;
  fail(condition: boolean, description: string): void;
  fail(callback: (args: TestArgs & WorkerArgs) => boolean): void;
  fail(callback: (args: TestArgs & WorkerArgs) => boolean, description: string): void;

  slow(): void;
  slow(condition: boolean): void;
  slow(condition: boolean, description: string): void;
  slow(callback: (args: TestArgs & WorkerArgs) => boolean): void;
  slow(callback: (args: TestArgs & WorkerArgs) => boolean, description: string): void;

  setTimeout(timeout: number): void;

  beforeEach(inner: (args: TestArgs & WorkerArgs, testInfo: TestInfo) => Promise<any> | any): void;
  afterEach(inner: (args: TestArgs & WorkerArgs, testInfo: TestInfo) => Promise<any> | any): void;
  beforeAll(inner: (args: WorkerArgs, workerInfo: WorkerInfo) => Promise<any> | any): void;
  afterAll(inner: (args: WorkerArgs, workerInfo: WorkerInfo) => Promise<any> | any): void;
  use(fixtures: Fixtures<{}, {}, TestArgs, WorkerArgs>): void;

  expect: Expect;

  declare<T extends KeyValue = {}, W extends KeyValue = {}>(): TestType<TestArgs & T, WorkerArgs & W>;
  extend<T, W extends KeyValue = {}>(fixtures: Fixtures<T, W, TestArgs, WorkerArgs>): TestType<TestArgs & T, WorkerArgs & W>;
}

export type KeyValue = { [key: string]: any };
type FixtureValue<R, Args, Info> = R | ((args: Args, run: (r: R) => Promise<void>, info: Info) => any);
export type Fixtures<T extends KeyValue = {}, W extends KeyValue = {}, PT extends KeyValue = {}, PW extends KeyValue = {}> = {
  [K in keyof PW]?: FixtureValue<PW[K], W & PW, WorkerInfo>;
} & {
  [K in keyof PT]?: FixtureValue<PT[K], T & W & PT & PW, TestInfo>;
} & {
  [K in keyof W]?: [FixtureValue<W[K], W & PW, WorkerInfo>, { scope: 'worker', auto?: boolean }];
} & {
  [K in keyof T]?: FixtureValue<T[K], T & W & PT & PW, TestInfo> | [FixtureValue<T[K], T & W & PT & PW, TestInfo>, { scope?: 'test', auto?: boolean }];
};

export type Location = {file: string, line: number, column: number};
export type FixturesWithLocation = {
  fixtures: Fixtures;
  location: Location;
};

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
