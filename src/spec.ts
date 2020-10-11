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

export class FixturesImpl<WorkerFixtures = {}, TestFixtures = {}, WorkerParameters = {}> {
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

  union<W1, T1, P1>(other: Fixtures<W1, T1, P1>): Fixtures<WorkerFixtures & W1, TestFixtures & T1, WorkerParameters & P1>;
  union(...others) {
    let pool = this._pool;
    for (const other of others)
      pool = pool.union(other._pool);
    pool.validate();
    return new FixturesImpl(pool);
  }

  extend<W = {}, T = {}, P = {}>(): Builder<WorkerFixtures & W, TestFixtures & T, WorkerParameters & P> {
    return new BuilderImpl(new FixturePool(this._pool)) as any;
  }

  generateParametrizedTests<T extends keyof WorkerParameters>(name: T, values: WorkerParameters[T][]) {
    setParameterValues(name as string, values);
  }
}

type FixtureOptions = {
  auto?: boolean;
};

export class BuilderImpl<WorkerFixtures = {}, TestFixtures = {}, WorkerParameters = {}> {
  _pool: FixturePool;

  constructor(pool: FixturePool) {
    this._pool = pool;
  }

  setTestFixture<N extends keyof TestFixtures>(name: N, fixture: (params: WorkerParameters & WorkerFixtures & TestFixtures, runTest: (value: TestFixtures[N]) => Promise<void>) => Promise<void>, options: FixtureOptions = {}): void {
    this._pool.registerFixture(name as string, 'test', fixture as any, options.auto, false);
  }

  overrideTestFixture<N extends keyof TestFixtures>(name: N, fixture: (params: WorkerParameters & WorkerFixtures & TestFixtures, runTest: (value: TestFixtures[N]) => Promise<void>) => Promise<void>, options: FixtureOptions = {}): void {
    this._pool.registerFixture(name as string, 'test', fixture as any, options.auto, true);
  }

  setWorkerFixture<N extends keyof WorkerFixtures>(name: N, fixture: (params: WorkerParameters & WorkerFixtures, runTest: (value: WorkerFixtures[N]) => Promise<void>) => Promise<void>, options: FixtureOptions = {}): void {
    this._pool.registerFixture(name as string, 'worker', fixture as any, options.auto, false);
  }

  overrideWorkerFixture<N extends keyof WorkerFixtures>(name: N, fixture: (params: WorkerParameters & WorkerFixtures, runTest: (value: WorkerFixtures[N]) => Promise<void>) => Promise<void>, options: FixtureOptions = {}): void {
    this._pool.registerFixture(name as string, 'worker', fixture as any, options.auto, true);
  }

  setParameter<N extends keyof WorkerParameters>(name: N, description: string, defaultValue: WorkerParameters[N]): void {
    this._pool.registerWorkerParameter({
      name: name as string,
      description,
      defaultValue: defaultValue as any,
    });
    this._pool.registerFixture(name as string, 'worker', async ({}, runTest) => runTest(defaultValue), false, false);
  }

  build(): Fixtures<WorkerFixtures, TestFixtures, WorkerParameters> {
    this._pool.validate();
    return new FixturesImpl(this._pool) as any;
  }
}


export interface Fixtures<W, T, P> extends FixturesImpl<W, T, P> {
}
export interface Builder<W, T, P> extends BuilderImpl<W, T, P> {
}

export const rootFixtures = new FixturesImpl(new FixturePool(undefined)) as Fixtures<{}, {}, {}>;
