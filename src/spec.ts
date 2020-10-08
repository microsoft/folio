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
import { FixturePool, setParameterValues } from './fixtures';
import { TestModifier } from './testModifier';

Error.stackTraceLimit = 15;

export type Implementation = {
  it: (spec: 'default' | 'skip' | 'only', fixtures: FixturesImpl, ...args: any[]) => void;
  describe: (spec: 'default' | 'skip' | 'only', fixtures: FixturesImpl, ...args: any[]) => void;
  beforeEach: (fixtures: FixturesImpl, fn: Function) => void;
  afterEach: (fixtures: FixturesImpl, fn: Function) => void;
  beforeAll: (fixtures: FixturesImpl, fn: Function) => void;
  afterAll: (fixtures: FixturesImpl, fn: Function) => void;
};

let implementation: Implementation;

export function setImplementation(i: Implementation) {
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
type FDescribe<WorkerParameters> = DescribeFunction<WorkerParameters>;
type XDescribe<WorkerParameters> = DescribeFunction<WorkerParameters>;
type BeforeEach<WorkerParameters, WorkerFixtures, TestFixtures> = (inner: (fixtures: WorkerParameters & WorkerFixtures & TestFixtures) => Promise<void>) => void;
type AfterEach<WorkerParameters, WorkerFixtures, TestFixtures> = (inner: (fixtures: WorkerParameters & WorkerFixtures & TestFixtures) => Promise<void>) => void;
type BeforeAll<WorkerFixtures> = (inner: (fixtures: WorkerFixtures) => Promise<void>) => void;
type AfterAll<WorkerFixtures> = (inner: (fixtures: WorkerFixtures) => Promise<void>) => void;

export class FixturesImpl<WorkerParameters = {}, WorkerFixtures = {}, TestFixtures = {}> {
  it: It<WorkerParameters, WorkerFixtures, TestFixtures>;
  fit: Fit<WorkerParameters, WorkerFixtures, TestFixtures>;
  xit: Xit<WorkerParameters, WorkerFixtures, TestFixtures>;
  test: It<WorkerParameters, WorkerFixtures, TestFixtures>;
  describe: Describe<WorkerParameters>;
  fdescribe: FDescribe<WorkerParameters>;
  xdescribe: XDescribe<WorkerParameters>;
  beforeEach: BeforeEach<WorkerParameters, WorkerFixtures, TestFixtures>;
  afterEach: AfterEach<WorkerParameters, WorkerFixtures, TestFixtures>;
  beforeAll: BeforeAll<WorkerFixtures>;
  afterAll: AfterAll<WorkerFixtures>;
  expect: typeof expect;

  _pool: FixturePool;

  constructor(pool: FixturePool) {
    this._pool = pool;
    this.expect = expect;
    this.it = ((...args: any[]) => {
      implementation.it('default', this, ...args);
    }) as any;
    this.test = this.it;
    this.it.skip = (...args: any[]) => implementation.it('skip', this, ...args);
    this.it.only = (...args: any[]) => implementation.it('only', this, ...args);
    this.fit = this.it.only;
    this.xit = this.it.skip;
    this.describe = ((...args: any[]) => {
      implementation.describe('default', this, ...args);
    }) as any;
    this.describe.skip = (...args: any[]) => implementation.describe('skip', this, ...args);
    this.describe.only = (...args: any[]) => implementation.describe('only', this, ...args);
    this.fdescribe = this.describe.only;
    this.xdescribe = this.describe.skip;
    this.beforeEach = fn => implementation.beforeEach(this, fn);
    this.afterEach = fn => implementation.afterEach(this, fn);
    this.beforeAll = fn => implementation.beforeAll(this, fn);
    this.afterAll = fn => implementation.afterAll(this, fn);
  }

  union<P1, W1, T1>(other1: Fixtures<P1, W1, T1>): Fixtures<WorkerParameters & P1, WorkerFixtures & W1, TestFixtures & T1>;
  union<P1, W1, T1, P2, W2, T2>(other1: Fixtures<P1, W1, T1>, other2: Fixtures<P2, W2, T2>): Fixtures<WorkerParameters & P1 & P2, WorkerFixtures & W1 & W2, TestFixtures & T1 & T2>;
  union<P1, W1, T1, P2, W2, T2, P3, W3, T3>(other1: Fixtures<P1, W1, T1>, other2: Fixtures<P2, W2, T2>, other3: Fixtures<P3, W3, T3>): Fixtures<WorkerParameters & P1 & P2 & P3, WorkerFixtures & W1 & W2 & W3, TestFixtures & T1 & T2 & T3>;
  union(...others) {
    let pool = this._pool;
    for (const other of others)
      pool = pool.union(other._pool);
    return new FixturesImpl(pool);
  }

  defineTestFixtures<T extends object>(o: { [ key in keyof T]: (params: WorkerParameters & WorkerFixtures & TestFixtures & T) => AsyncGenerator<T[key]> }): Fixtures<WorkerParameters, WorkerFixtures, TestFixtures & T> {
    const result = new FixturesImpl(new FixturePool(this._pool));
    for (const [ name, fixture ] of Object.entries(o))
      result._pool.registerFixture(name, 'test', fixture as any, name.startsWith('auto'), false);
    result._pool.checkCycles();
    return result as any;
  }

  overrideTestFixtures(o: { [ key in keyof TestFixtures ]?: (params: WorkerParameters & WorkerFixtures & TestFixtures) => AsyncGenerator<TestFixtures[key]> }): Fixtures<WorkerParameters, WorkerFixtures, TestFixtures> {
    const result = new FixturesImpl(new FixturePool(this._pool));
    for (const [ name, fixture ] of Object.entries(o))
      result._pool.registerFixture(name, 'test', fixture as any, name.startsWith('auto'), true);
    result._pool.checkCycles();
    return result as any;
  }

  defineWorkerFixtures<T extends object>(o: { [ key in keyof T]: (params: WorkerParameters & WorkerFixtures & T) => AsyncGenerator<T[key]> }): Fixtures<WorkerParameters, WorkerFixtures & T, TestFixtures> {
    const result = new FixturesImpl(new FixturePool(this._pool));
    for (const [ name, fixture ] of Object.entries(o))
      result._pool.registerFixture(name, 'worker', fixture as any, name.startsWith('auto'), false);
    result._pool.checkCycles();
    return result as any;
  }

  overrideWorkerFixtures(o: { [ key in keyof WorkerFixtures ]?: (params: WorkerParameters & WorkerFixtures) => AsyncGenerator<WorkerFixtures[key]> }): Fixtures<WorkerParameters, WorkerFixtures, TestFixtures> {
    const result = new FixturesImpl(new FixturePool(this._pool));
    for (const [ name, fixture ] of Object.entries(o))
      result._pool.registerFixture(name, 'worker', fixture as any, name.startsWith('auto'), true);
    result._pool.checkCycles();
    return result as any;
  }

  defineParameter<N extends string, P>(name: N, description: string, defaultValue: P): Fixtures<WorkerParameters & { [key in N] : P }, WorkerFixtures, TestFixtures> {
    const result = new FixturesImpl(new FixturePool(this._pool));
    result._pool.registerWorkerParameter({
      name: name as string,
      description,
      defaultValue: defaultValue as any,
    });
    result._pool.registerFixture(name as string, 'worker', async ({}, runTest) => runTest(defaultValue), false, false);
    return result as any;
  }

  generateParametrizedTests<T extends keyof WorkerParameters>(name: T, values: WorkerParameters[T][]) {
    setParameterValues(name as string, values);
  }
}

export interface Fixtures<P, W, T> extends FixturesImpl<P, W, T> {
}

export const rootFixtures = new FixturesImpl(new FixturePool(undefined)) as Fixtures<{}, {}, {}>;
