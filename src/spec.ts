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
import { TestModifier } from './testModifier';
import { errorWithCallLocation } from './util';

Error.stackTraceLimit = 15;

export type SpecType = 'default' | 'skip' | 'only';

export type Implementation = {
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

interface DescribeHelper<WorkerParameters> {
  describe(name: string, inner: () => void): void;
  describe(name: string, modifierFn: (modifier: TestModifier, parameters: WorkerParameters) => any, inner: () => void): void;
}
type DescribeFunction<WorkerParameters> = DescribeHelper<WorkerParameters>['describe'];
interface ItHelper<WorkerParameters, WorkerFixtures, TestFixtures> {
  it(name: string, inner: (fixtures: WorkerParameters & WorkerFixtures & TestFixtures) => Promise<void> | void): void;
  it(name: string, modifierFn: (modifier: TestModifier, parameters: WorkerParameters) => any, inner: (fixtures: WorkerParameters & WorkerFixtures & TestFixtures) => Promise<void> | void): void;
}
type ItFunction<WorkerParameters, WorkerFixtures, TestFixtures> = ItHelper<WorkerParameters, WorkerFixtures, TestFixtures>['it'];
type It<WorkerParameters, WorkerFixtures, TestFixtures> = ItFunction<WorkerParameters, WorkerFixtures, TestFixtures> & {
  only: ItFunction<WorkerParameters, WorkerFixtures, TestFixtures>;
  skip: ItFunction<WorkerParameters, WorkerFixtures, TestFixtures>;
};
type Fit<WorkerParameters, WorkerFixtures, TestFixtures> = ItFunction<WorkerParameters, WorkerFixtures, TestFixtures>;
type Xit<WorkerParameters, WorkerFixtures, TestFixtures> = ItFunction<WorkerParameters, WorkerFixtures, TestFixtures>;
type Describe<WorkerParameters> = DescribeFunction<WorkerParameters> & {
  only: DescribeFunction<WorkerParameters>;
  skip: DescribeFunction<WorkerParameters>;
};
type BeforeEach<WorkerParameters, WorkerFixtures, TestFixtures> = (inner: (fixtures: WorkerParameters & WorkerFixtures & TestFixtures) => Promise<void>) => void;
type AfterEach<WorkerParameters, WorkerFixtures, TestFixtures> = (inner: (fixtures: WorkerParameters & WorkerFixtures & TestFixtures) => Promise<void>) => void;
type BeforeAll<WorkerFixtures> = (inner: (fixtures: WorkerFixtures) => Promise<void>) => void;
type AfterAll<WorkerFixtures> = (inner: (fixtures: WorkerFixtures) => Promise<void>) => void;

class FolioImpl<TestFixtures = {}, WorkerFixtures = {}, WorkerParameters = {}> {
  it: It<WorkerParameters, WorkerFixtures, TestFixtures>;
  fit: Fit<WorkerParameters, WorkerFixtures, TestFixtures>;
  xit: Xit<WorkerParameters, WorkerFixtures, TestFixtures>;
  test: It<WorkerParameters, WorkerFixtures, TestFixtures>;
  describe: Describe<WorkerParameters>;
  beforeEach: BeforeEach<WorkerParameters, WorkerFixtures, TestFixtures>;
  afterEach: AfterEach<WorkerParameters, WorkerFixtures, TestFixtures>;
  beforeAll: BeforeAll<WorkerFixtures>;
  afterAll: AfterAll<WorkerFixtures>;
  expect: typeof expect;

  constructor() {
    this.expect = expect;
    this.it = ((...args: any[]) => {
      if (!implementation)
        throw errorWithCallLocation(`Test cannot be defined in a fixture file.`);
      implementation.it('default', ...args);
    }) as any;
    this.test = this.it;
    this.it.skip = (...args: any[]) => {
      if (!implementation)
        throw errorWithCallLocation(`Test cannot be defined in a fixture file.`);
      implementation.it('skip', ...args);
    };
    this.it.only = (...args: any[]) => {
      if (!implementation)
        throw errorWithCallLocation(`Test cannot be defined in a fixture file.`);
      implementation.it('only', ...args);
    };
    this.fit = this.it.only;
    this.xit = this.it.skip;
    this.describe = ((...args: any[]) => {
      if (!implementation)
        throw errorWithCallLocation(`Suite cannot be defined in a fixture file.`);
      implementation.describe('default', ...args);
    }) as any;
    this.describe.skip = (...args: any[]) => {
      if (!implementation)
        throw errorWithCallLocation(`Suite cannot be defined in a fixture file.`);
      implementation.describe('skip', ...args);
    };
    this.describe.only = (...args: any[]) => {
      if (!implementation)
        throw errorWithCallLocation(`Suite cannot be defined in a fixture file.`);
      implementation.describe('only', ...args);
    };
    this.beforeEach = fn => {
      if (!implementation)
        throw errorWithCallLocation(`Hook cannot be defined in a fixture file.`);
      implementation.beforeEach(fn);
    };
    this.afterEach = fn => {
      if (!implementation)
        throw errorWithCallLocation(`Hook cannot be defined in a fixture file.`);
      implementation.afterEach(fn);
    };
    this.beforeAll = fn => {
      if (!implementation)
        throw errorWithCallLocation(`Hook cannot be defined in a fixture file.`);
      implementation.beforeAll(fn);
    };
    this.afterAll = fn => {
      if (!implementation)
        throw errorWithCallLocation(`Hook cannot be defined in a fixture file.`);
      implementation.afterAll(fn);
    };
  }
}

export const folio = new FolioImpl();
