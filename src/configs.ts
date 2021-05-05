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

export type ReporterDescription =
  'dot' |
  'line' |
  'list' |
  'junit' | { name: 'junit', outputFile?: string, stripANSIControlSequences?: boolean } |
  'json' | { name: 'json', outputFile?: string } |
  'null' |
  string;

export type Shard = { total: number, current: number } | null;

export interface DefinedEnv {
  // Just a tag type.
  __tag: 'defined-env';
}

export interface Project<Options = {}> {
  defines?: DefinedEnv[];
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
  projects?: Project[];
  reporter?: ReporterDescription | ReporterDescription[];
  quiet?: boolean;
  shard?: Shard;
  updateSnapshots?: boolean;
  workers?: number;
}

export interface FullConfig {
  forbidOnly: boolean;
  globalSetup: string | null;
  globalTeardown: string | null;
  globalTimeout: number;
  grep: RegExp | RegExp[];
  maxFailures: number;
  reporter: ReporterDescription[];
  rootDir: string;
  quiet: boolean;
  shard: Shard;
  updateSnapshots: boolean;
  workers: number;
}

export interface ConfigOverrides {
  forbidOnly?: boolean;
  globalTimeout?: number;
  grep?: RegExp | RegExp[];
  maxFailures?: number;
  repeatEach?: number;
  outputDir?: string;
  retries?: number;
  reporter?: ReporterDescription[];
  quiet?: boolean;
  shard?: Shard;
  timeout?: number;
  updateSnapshots?: boolean;
  workers?: number;
}
