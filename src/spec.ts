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

import { description } from 'commander';
import { expect } from './expect';
import { FixturePool, setParameterValues } from './fixtures';
import { TestModifier } from './testModifier';

Error.stackTraceLimit = 15;

export type Implementation = {
  it: (spec: 'default' | 'skip' | 'only', folio: FolioImpl, ...args: any[]) => void;
  describe: (spec: 'default' | 'skip' | 'only', folio: FolioImpl, ...args: any[]) => void;
  beforeEach: (folio: FolioImpl, fn: Function) => void;
  afterEach: (folio: FolioImpl, fn: Function) => void;
  beforeAll: (folio: FolioImpl, fn: Function) => void;
  afterAll: (folio: FolioImpl, fn: Function) => void;
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

export class FolioImpl<WorkerFixtures = {}, TestFixtures = {}, WorkerParameters = {}> {
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

  union<W1, T1, P1>(other: Folio<W1, T1, P1>): Folio<WorkerFixtures & W1, TestFixtures & T1, WorkerParameters & P1>;
  union(...others) {
    let pool = this._pool;
    for (const other of others)
      pool = pool.union(other._pool);
    pool.validate();
    return new FolioImpl(pool);
  }

  extend<W = {}, T = {}, P = {}>(): Fixtures<WorkerFixtures, TestFixtures, WorkerParameters, W, T, P> {
    return new Proxy(new FixturesImpl(new FixturePool(this._pool)), proxyHandler) as any;
  }

  generateParametrizedTests<T extends keyof WorkerParameters>(name: T, values: WorkerParameters[T][]) {
    setParameterValues(name as string, values);
  }
}

type FixtureOptions = {
  auto?: boolean;
};
type WorkerParameter<R> = {
  initParameter(description: string, defaultValue: R): void;
};
type WorkerFixture<PW, R> = {
  initWorker(fixture: (params: PW, runTest: (value: R) => Promise<void>) => Promise<void>, options?: FixtureOptions): void;
};
type InheritedWorkerFixture<PW, R> = {
  overrideWorker(fixture: (params: PW, runTest: (value: R) => Promise<void>) => Promise<void>): void;
};
type TestFixture<PWT, R> = {
  initTest(fixture: (params: PWT, runTest: (value: R) => Promise<void>) => Promise<void>, options?: FixtureOptions): void;
};
type InheritedTestFixture<PWT, R> = {
  overrideTest(fixture: (params: PWT, runTest: (value: R) => Promise<void>) => Promise<void>): void;
};
type Fixtures<WorkerFixtures, TestFixtures, WorkerParameters, W, T, P> = {
  [X in keyof P]: WorkerParameter<P[X]>;
} & {
  [X in keyof W]: WorkerFixture<WorkerParameters & P & WorkerFixtures & W, W[X]>;
} & {
  [X in keyof T]: TestFixture<WorkerParameters & P & WorkerFixtures & W & TestFixtures & T, T[X]>;
} & {
  [X in keyof WorkerFixtures]: InheritedWorkerFixture<WorkerParameters & P & WorkerFixtures & W, WorkerFixtures[X]>;
} &  {
  [X in keyof TestFixtures]: InheritedTestFixture<WorkerParameters & P & WorkerFixtures & W & TestFixtures & T, TestFixtures[X]>;
} & FixturesImpl<WorkerFixtures, TestFixtures, WorkerParameters, W, T, P>;

class FixturesImpl<WorkerFixtures, TestFixtures, WorkerParameters, W, T, P> {
  private _pool: FixturePool;
  private _finished: boolean;

  constructor(pool: FixturePool) {
    this._pool = pool;
    this._finished = false;
  }

  setTestFixture<N extends keyof T>(name: N, fixture: (params: WorkerParameters & P & WorkerFixtures & W & TestFixtures & T, runTest: (value: T[N]) => Promise<void>) => Promise<void>, options: FixtureOptions = {}): void {
    if (this._finished)
      throw new Error(`Should not modify fixtures after build()`);
    this._pool.registerFixture(name as string, 'test', fixture as any, options.auto, false);
  }

  overrideTestFixture<N extends keyof(TestFixtures & T)>(name: N, fixture: (params: WorkerParameters & P & WorkerFixtures & W & TestFixtures & T, runTest: (value: (TestFixtures & T)[N]) => Promise<void>) => Promise<void>, options: FixtureOptions = {}): void {
    if (this._finished)
      throw new Error(`Should not modify fixtures after build()`);
    this._pool.registerFixture(name as string, 'test', fixture as any, options.auto, true);
  }

  setWorkerFixture<N extends keyof W>(name: N, fixture: (params: WorkerParameters & P & WorkerFixtures & W, runTest: (value: W[N]) => Promise<void>) => Promise<void>, options: FixtureOptions = {}): void {
    if (this._finished)
      throw new Error(`Should not modify fixtures after build()`);
    this._pool.registerFixture(name as string, 'worker', fixture as any, options.auto, false);
  }

  overrideWorkerFixture<N extends keyof(WorkerFixtures & W)>(name: N, fixture: (params: WorkerParameters & P & WorkerFixtures & W, runTest: (value: (WorkerFixtures & W)[N]) => Promise<void>) => Promise<void>, options: FixtureOptions = {}): void {
    if (this._finished)
      throw new Error(`Should not modify fixtures after build()`);
    this._pool.registerFixture(name as string, 'worker', fixture as any, options.auto, true);
  }

  setParameter<N extends keyof P>(name: N, description: string, defaultValue: P[N]): void {
    if (this._finished)
      throw new Error(`Should not modify fixtures after build()`);
    this._pool.registerFixture(name as string, 'worker', async ({}, runTest) => runTest(defaultValue), false, false);
    this._pool.registerWorkerParameter({
      name: name as string,
      description,
      defaultValue: defaultValue as any,
    });
  }

  build(): Folio<WorkerFixtures & W, TestFixtures & T, WorkerParameters & P> {
    if (this._finished)
      throw new Error(`Should not call build() twice`);
    this._pool.validate();
    this._finished = true;
    return new FolioImpl(this._pool) as any;
  }
}

const proxyHandler: ProxyHandler<FixturesImpl<any, any, any, any, any, any>> = {
  get: (target, prop, receiver) => {
    if (prop in target)
      return target[prop];
    if (typeof prop !== 'string' || prop === 'then')
      return undefined;
    return {
      initParameter: (description, defaultValue) => target.setParameter(prop as any, description, defaultValue),
      initWorker: (fn, options) => target.setWorkerFixture(prop as any, fn, options),
      overrideWorker: fn => target.overrideWorkerFixture(prop as any, fn),
      initTest: (fn, options) => target.setTestFixture(prop as any, fn, options),
      overrideTest: fn => target.overrideTestFixture(prop as any, fn),
    };
  },
};

export interface Folio<W, T, P> extends FolioImpl<W, T, P> {
}

export const rootFixtures = new FolioImpl(new FixturePool(undefined)) as Folio<{}, {}, {}>;
