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
import { errorWithCallLocation } from './util';

Error.stackTraceLimit = 15;

export type SpecType = 'default' | 'skip' | 'only';

export type Implementation = {
  it: (spec: SpecType, folio: FolioImpl, ...args: any[]) => void;
  describe: (spec: SpecType, folio: FolioImpl, ...args: any[]) => void;
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
type BeforeEach<WorkerParameters, WorkerFixtures, TestFixtures> = (inner: (fixtures: WorkerParameters & WorkerFixtures & TestFixtures) => Promise<void>) => void;
type AfterEach<WorkerParameters, WorkerFixtures, TestFixtures> = (inner: (fixtures: WorkerParameters & WorkerFixtures & TestFixtures) => Promise<void>) => void;
type BeforeAll<WorkerFixtures> = (inner: (fixtures: WorkerFixtures) => Promise<void>) => void;
type AfterAll<WorkerFixtures> = (inner: (fixtures: WorkerFixtures) => Promise<void>) => void;

export class FolioImpl<TestFixtures = {}, WorkerFixtures = {}, WorkerParameters = {}> {
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
    this.beforeEach = fn => implementation.beforeEach(this, fn);
    this.afterEach = fn => implementation.afterEach(this, fn);
    this.beforeAll = fn => implementation.beforeAll(this, fn);
    this.afterAll = fn => implementation.afterAll(this, fn);
  }

  union<T, W, P>(other: Folio<T, W, P>): Folio<TestFixtures & T, WorkerFixtures & W, WorkerParameters & P> {
    const pool = this._pool.union(other._pool);
    pool.validate();
    return new FolioImpl(pool) as any;
  }

  extend<T = {}, W = {}, P = {}>(): Fixtures<TestFixtures, WorkerFixtures, WorkerParameters, T, W, P> {
    return new Proxy(new FixturesImpl(new FixturePool(this._pool)), proxyHandler) as any;
  }

  generateParametrizedTests<T extends keyof WorkerParameters>(name: T, values: WorkerParameters[T][]) {
    setParameterValues(name as string, values);
  }
}

type FixtureOptions = {
  auto?: boolean;
  scope?: 'test' | 'worker';
};

type TestFixtureOptions = {
  auto?: boolean;
  scope?: 'test'
};

type WorkerFixtureOptions = {
  auto?: boolean;
  scope: 'worker';
};

type WorkerParameterInitializer<R> = {
  initParameter(description: string, defaultValue: R): void;
};
type WorkerFixtureInitializer<PW, R> = {
  init(fixture: (params: PW, runTest: (value: R) => Promise<void>) => Promise<void>, options: WorkerFixtureOptions): void;
};
type WorkerFixtureOverrider<PW, R> = {
  override(fixture: (params: PW, runTest: (value: R) => Promise<void>) => Promise<void>): void;
};
type TestFixtureInitializer<PWT, R> = {
  init(fixture: (params: PWT, runTest: (value: R) => Promise<void>) => Promise<void>, options?: TestFixtureOptions): void;
};
type TestFixtureOverrider<PWT, R> = {
  override(fixture: (params: PWT, runTest: (value: R) => Promise<void>) => Promise<void>): void;
};

type Fixtures<TestFixtures, WorkerFixtures, WorkerParameters, T, W, P> = {
  [X in keyof P]: WorkerParameterInitializer<P[X]>;
} & {
  [X in keyof W]: WorkerFixtureInitializer<WorkerParameters & P & WorkerFixtures & W, W[X]>;
} & {
  [X in keyof T]: TestFixtureInitializer<WorkerParameters & P & WorkerFixtures & W & TestFixtures & T, T[X]>;
} & {
  [X in keyof WorkerFixtures]: WorkerFixtureOverrider<WorkerParameters & P & WorkerFixtures & W, WorkerFixtures[X]>;
} &  {
  [X in keyof TestFixtures]: TestFixtureOverrider<WorkerParameters & P & WorkerFixtures & W & TestFixtures & T, TestFixtures[X]>;
} & {
  build(): Folio<TestFixtures & T, WorkerFixtures & W, WorkerParameters & P>
};

class FixturesImpl<TestFixtures, WorkerFixtures, WorkerParameters, T, W, P> {
  private _pool: FixturePool;
  private _finished: boolean;

  constructor(pool: FixturePool) {
    this._pool = pool;
    this._finished = false;
  }

  _init(name: string, fixture: (params: any, runTest: (value: any) => Promise<void>) => Promise<void>, options?: FixtureOptions): void {
    if (this._finished)
      throw errorWithCallLocation(`Should not modify fixtures after build()`);
    this._pool.registerFixture(name as string, options && options.scope === 'worker' ? 'worker' : 'test', fixture as any, options && options.auto);
  }

  _override(name: string, fixture: (params: any, runTest: (value: any) => Promise<void>) => Promise<void>): void {
    if (this._finished)
      throw errorWithCallLocation(`Should not modify fixtures after build()`);
    this._pool.overrideFixture(name as string, fixture as any);
  }

  _initParameter<N extends keyof P>(name: N, description: string, defaultValue: P[N]): void {
    if (this._finished)
      throw errorWithCallLocation(`Should not modify fixtures after build()`);
    this._pool.registerFixture(name as string, 'worker', async ({}, runTest) => runTest(defaultValue), false);
    this._pool.registerWorkerParameter({
      name: name as string,
      description,
      defaultValue: defaultValue as any,
    });
  }

  build(): Folio<TestFixtures & T, WorkerFixtures & W, WorkerParameters & P> {
    if (this._finished)
      throw errorWithCallLocation(`Should not call build() twice`);
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
      initParameter: (description, defaultValue) => target._initParameter(prop as any, description, defaultValue),
      init: (fn, options) => target._init(prop as any, fn, options),
      override: fn => target._override(prop as any, fn),
    };
  },
};

export interface Folio<T, W, P> extends FolioImpl<T, W, P> {
}

export const rootFixtures = new FolioImpl(new FixturePool(undefined)) as Folio<{}, {}, {}>;
