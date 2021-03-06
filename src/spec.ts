/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { expect } from './expect';
import { errorWithCallLocation } from './util';

Error.stackTraceLimit = 15;

export type SpecType = 'default' | 'skip' | 'only';

export type Implementation = {
  startSuite: (options: folio.SuiteOptions) => void;
  it: (spec: SpecType, ...args: any[]) => void;
  describe: (spec: SpecType, ...args: any[]) => void;
  beforeEach: (fn: Function) => void;
  afterEach: (fn: Function) => void;
  beforeAll: (fn: Function) => void;
  afterAll: (fn: Function) => void;
};

let implementation: Implementation | undefined;

export function setImplementation(i: Implementation | undefined) {
  implementation = i;
}

export function createTestImpl(options: folio.SuiteOptions) {
  if (!implementation)
    throw errorWithCallLocation(`Test cannot be defined in a fixture file.`);
  implementation.startSuite(options);
  const test: any = ((...args: any[]) => {
    if (!implementation)
      throw errorWithCallLocation(`Test cannot be defined in a fixture file.`);
    implementation.it('default', ...args);
  });
  test.expect = expect;
  test.skip = (...args: any[]) => {
    if (!implementation)
      throw errorWithCallLocation(`Test cannot be defined in a fixture file.`);
    implementation.it('skip', ...args);
  };
  test.only = (...args: any[]) => {
    if (!implementation)
      throw errorWithCallLocation(`Test cannot be defined in a fixture file.`);
    implementation.it('only', ...args);
  };
  test.describe = ((...args: any[]) => {
    if (!implementation)
      throw errorWithCallLocation(`Suite cannot be defined in a fixture file.`);
    implementation.describe('default', ...args);
  }) as any;
  test.describe.skip = (...args: any[]) => {
    if (!implementation)
      throw errorWithCallLocation(`Suite cannot be defined in a fixture file.`);
    implementation.describe('skip', ...args);
  };
  test.describe.only = (...args: any[]) => {
    if (!implementation)
      throw errorWithCallLocation(`Suite cannot be defined in a fixture file.`);
    implementation.describe('only', ...args);
  };
  test.beforeEach = fn => {
    if (!implementation)
      throw errorWithCallLocation(`Hook cannot be defined in a fixture file.`);
    implementation.beforeEach(fn);
  };
  test.afterEach = fn => {
    if (!implementation)
      throw errorWithCallLocation(`Hook cannot be defined in a fixture file.`);
    implementation.afterEach(fn);
  };
  test.beforeAll = fn => {
    if (!implementation)
      throw errorWithCallLocation(`Hook cannot be defined in a fixture file.`);
    implementation.beforeAll(fn);
  };
  test.afterAll = fn => {
    if (!implementation)
      throw errorWithCallLocation(`Hook cannot be defined in a fixture file.`);
    implementation.afterAll(fn);
  };
  return test;
}
