/**
 * Copyright 2019 Google Inc. All rights reserved.
 * Modifications copyright (c) Microsoft Corporation.
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

import { expect } from './expect';
export { expect } from './expect';
import { config, registerFixture, registerWorkerFixture, registerWorkerParameter, setParameterValues, TestInfo } from './fixtures';
import { compare } from './golden';
import * as spec from './spec';
import { TestModifier } from './testModifier';
export { Config } from './config';
export { config, TestInfo, currentTestInfo } from './fixtures';
import prettyFormat from 'pretty-format';

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

class FixturesImpl<WorkerParameters, WorkerFixtures, TestFixtures> {
  it: It<WorkerParameters, WorkerFixtures, TestFixtures> = spec.it;
  fit: Fit<WorkerParameters, WorkerFixtures, TestFixtures> = spec.it.only;
  xit: Xit<WorkerParameters, WorkerFixtures, TestFixtures> = spec.it.skip;
  test: It<WorkerParameters, WorkerFixtures, TestFixtures> = spec.it;
  describe: Describe<WorkerParameters> = spec.describe;
  fdescribe: FDescribe<WorkerParameters> = spec.describe.only;
  xdescribe: XDescribe<WorkerParameters> = spec.describe.skip;
  beforeEach: BeforeEach<WorkerParameters, WorkerFixtures, TestFixtures> = spec.beforeEach;
  afterEach: AfterEach<WorkerParameters, WorkerFixtures, TestFixtures> = spec.afterEach;
  beforeAll: BeforeAll<WorkerFixtures> = spec.beforeAll;
  afterAll: AfterAll<WorkerFixtures> = spec.afterAll;
  expect: typeof expect = expect;

  union<P1, W1, T1>(other1: Fixtures<P1, W1, T1>): Fixtures<WorkerParameters & P1, WorkerFixtures & W1, TestFixtures & T1>;
  union<P1, W1, T1, P2, W2, T2>(other1: Fixtures<P1, W1, T1>, other2: Fixtures<P2, W2, T2>): Fixtures<WorkerParameters & P1 & P2, WorkerFixtures & W1 & W2, TestFixtures & T1 & T2>;
  union<P1, W1, T1, P2, W2, T2, P3, W3, T3>(other1: Fixtures<P1, W1, T1>, other2: Fixtures<P2, W2, T2>, other3: Fixtures<P3, W3, T3>): Fixtures<WorkerParameters & P1 & P2 & P3, WorkerFixtures & W1 & W2 & W3, TestFixtures & T1 & T2 & T3>;
  union(...others) {
    return this;
  }

  defineTestFixtures<T extends object>(o: { [ key in keyof T]: (params: WorkerParameters & WorkerFixtures & TestFixtures & T, runTest: (value: T[key]) => Promise<void>) => Promise<void> }): Fixtures<WorkerParameters, WorkerFixtures, TestFixtures & T> {
    for (const [ name, fixture ] of Object.entries(o))
      registerFixture(name, fixture as any, { auto: name.startsWith('auto') }, false);
    return this as any;
  }

  overrideTestFixtures(o: { [ key in keyof TestFixtures ]?: (params: WorkerParameters & WorkerFixtures & TestFixtures, runTest: (value: TestFixtures[key]) => Promise<void>) => Promise<void> }): Fixtures<WorkerParameters, WorkerFixtures, TestFixtures> {
    for (const [ name, fixture ] of Object.entries(o))
      registerFixture(name, fixture as any, { auto: name.startsWith('auto') }, true);
    return this;
  }

  defineWorkerFixtures<T extends object>(o: { [ key in keyof T]: (params: WorkerParameters & WorkerFixtures & T, runTest: (value: T[key]) => Promise<void>) => Promise<void> }): Fixtures<WorkerParameters, WorkerFixtures & T, TestFixtures> {
    for (const [ name, fixture ] of Object.entries(o))
      registerWorkerFixture(name, fixture as any, { auto: name.startsWith('auto') }, false);
    return this as any;
  }

  overrideWorkerFixtures(o: { [ key in keyof WorkerFixtures ]?: (params: WorkerParameters & WorkerFixtures, runTest: (value: WorkerFixtures[key]) => Promise<void>) => Promise<void> }): Fixtures<WorkerParameters, WorkerFixtures, TestFixtures> {
    for (const [ name, fixture ] of Object.entries(o))
      registerWorkerFixture(name, fixture as any, { auto: name.startsWith('auto') }, true);
    return this;
  }

  defineParameter<N extends string, P>(name: N, description: string, defaultValue: P): Fixtures<WorkerParameters & { [key in N] : P }, WorkerFixtures, TestFixtures> {
    registerWorkerParameter({
      name: name as string,
      description,
      defaultValue: defaultValue as any,
    });
    registerWorkerFixture(name as string, async ({}, runTest) => runTest(defaultValue), {}, false);
    return this as any;
  }

  generateParametrizedTests<T extends keyof WorkerParameters>(name: T, values: WorkerParameters[T][]) {
    setParameterValues(name as string, values);
  }
}

export interface Fixtures<P, W, T> extends FixturesImpl<P, W, T> {
}

type BuiltinWorkerFixtures = {
  // Worker index that runs this test.
  testWorkerIndex: number;
};

type BuiltinTestFixtures = {
  // Information about the test being run.
  testInfo: TestInfo;
  // Parameter-based relative path to be overridden, empty by default.
  testParametersPathSegment: string;
};

export const fixtures = new FixturesImpl<{}, {}, {}>().defineWorkerFixtures<BuiltinWorkerFixtures>({
  testWorkerIndex: async ({}, runTest) => {
    // Worker injects the value for this one.
    await runTest(undefined as any);
  }
}).defineTestFixtures<BuiltinTestFixtures>({
  testInfo: async ({}, runTest) => {
    // Worker injects the value for this one.
    await runTest(undefined as any);
  },

  testParametersPathSegment: async ({}, runTest) => {
    await runTest('');
  },
});
