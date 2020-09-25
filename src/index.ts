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

import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import expectFunction from 'expect';
import { config, registerFixture, registerWorkerFixture, registerWorkerParameter, setParameterValues, TestInfo, FixtureDefinitionOptions } from './fixtures';
import * as spec from './spec';
import { TestModifier } from './testModifier';
export { Config } from './config';
export { TestInfo } from './fixtures';
export { config } from './fixtures';

const mkdirAsync = promisify(fs.mkdir);

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
  describe: Describe<WorkerParameters> = spec.describe;
  fdescribe: FDescribe<WorkerParameters> = spec.describe.only;
  xdescribe: XDescribe<WorkerParameters> = spec.describe.skip;
  beforeEach: BeforeEach<WorkerParameters, WorkerFixtures, TestFixtures> = spec.beforeEach;
  afterEach: AfterEach<WorkerParameters, WorkerFixtures, TestFixtures> = spec.afterEach;
  beforeAll: BeforeAll<WorkerFixtures> = spec.beforeAll;
  afterAll: AfterAll<WorkerFixtures> = spec.afterAll;
  expect: typeof expectFunction = expectFunction;

  union<P1, W1, T1>(other1: Fixtures<P1, W1, T1>): Fixtures<WorkerParameters & P1, WorkerFixtures & W1, TestFixtures & T1>;
  union<P1, W1, T1, P2, W2, T2>(other1: Fixtures<P1, W1, T1>, other2: Fixtures<P2, W2, T2>): Fixtures<WorkerParameters & P1 & P2, WorkerFixtures & W1 & W2, TestFixtures & T1 & T2>;
  union<P1, W1, T1, P2, W2, T2, P3, W3, T3>(other1: Fixtures<P1, W1, T1>, other2: Fixtures<P2, W2, T2>, other3: Fixtures<P3, W3, T3>): Fixtures<WorkerParameters & P1 & P2 & P3, WorkerFixtures & W1 & W2 & W3, TestFixtures & T1 & T2 & T3>;
  union(...others) {
    return this;
  }

  declareTestFixtures<T>(): Fixtures<WorkerParameters, WorkerFixtures, TestFixtures & T> {
    return this as any;
  }

  defineTestFixture<T extends keyof TestFixtures>(name: T | '*', fn: (params: WorkerParameters & WorkerFixtures & TestFixtures, runTest: (arg: TestFixtures[T]) => Promise<void>) => Promise<void>, options: FixtureDefinitionOptions = {}) {
    // TODO: make this throw when overriding.
    registerFixture(name as string, fn, options);
  }

  overrideTestFixture<T extends keyof TestFixtures>(name: T, fn: (params: WorkerParameters & WorkerFixtures & TestFixtures, runTest: (arg: TestFixtures[T]) => Promise<void>) => Promise<void>, options: FixtureDefinitionOptions = {}) {
    // TODO: make this throw when not overriding.
    registerFixture(name as string, fn, options);
  }

  declareWorkerFixtures<W>(): Fixtures<WorkerParameters, WorkerFixtures & W, TestFixtures> {
    return this as any;
  }

  defineWorkerFixture<T extends keyof WorkerFixtures>(name: T | '*', fn: (params: WorkerParameters & WorkerFixtures, runTest: (arg: WorkerFixtures[T]) => Promise<void>) => Promise<void>, options: FixtureDefinitionOptions = {}) {
    // TODO: make this throw when overriding.
    registerWorkerFixture(name as string, fn, options);
  }

  overrideWorkerFixture<T extends keyof WorkerFixtures>(name: T, fn: (params: WorkerFixtures, runTest: (arg: WorkerFixtures[T]) => Promise<void>) => Promise<void>, options: FixtureDefinitionOptions = {}) {
    // TODO: make this throw when not overriding.
    registerWorkerFixture(name as string, fn, options);
  }

  declareParameters<P>(): Fixtures<WorkerParameters & P, WorkerFixtures, TestFixtures> {
    return this as any;
  }

  defineParameter<T extends keyof WorkerParameters>(name: T, description: string, defaultValue: WorkerParameters[T]) {
    registerWorkerParameter({
      name: name as string,
      description,
      defaultValue: defaultValue as any,
    });
    registerWorkerFixture(name as string, async ({}, runTest) => runTest(defaultValue), {});
  }

  generateParametrizedTests<T extends keyof WorkerParameters>(name: T, values: WorkerParameters[T][]) {
    setParameterValues(name as string, values);
  }
}

export interface Fixtures<P, W, T> extends FixturesImpl<P, W, T> {
}

type BuiltinWorkerParameters = {
};

type BuiltinWorkerFixtures = {
  // Worker index that runs this test.
  testWorkerIndex: number;
};

type BuiltinTestFixtures = {
  // Information about the test being run.
  testInfo: TestInfo;
  // File name for an artifact this test intends to write.
  testOutputFile: (suffix: string) => Promise<string>;
};

export const fixtures = new FixturesImpl<BuiltinWorkerParameters, BuiltinWorkerFixtures, BuiltinTestFixtures>();
export const expect = expectFunction;

fixtures.defineWorkerFixture('testWorkerIndex', async ({}, runTest) => {
  // Worker injects the value for this one.
  await runTest(undefined as any);
});

fixtures.defineTestFixture('testInfo', async ({}, runTest) => {
  // Worker injects the value for this one.
  await runTest(undefined as any);
});

fixtures.defineTestFixture('testOutputFile', async ({ testInfo }, runTest) => {
  const outputFile = async (suffix: string): Promise<string> => {
    const relativePath = path.relative(config.testDir, testInfo.file)
        .replace(/\.spec\.[jt]s/, '')
        .replace(new RegExp(`(tests|test|src)${path.sep}`), '');
    const sanitizedTitle = testInfo.title.replace(/[^\w\d]+/g, '_');
    const assetPath = path.join(config.outputDir, relativePath, `${sanitizedTitle}-${suffix}`);
    await mkdirAsync(path.dirname(assetPath), {
      recursive: true
    });
    return assetPath;
  };
  await runTest(outputFile);
});
