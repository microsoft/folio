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

export { expect } from './expect';
import { TestInfo } from './fixtures';
import { rootFixtures } from './spec';
export { Fixtures } from './spec';
export { Config } from './config';
export { config, TestInfo, currentTestInfo } from './fixtures';

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

export const fixtures = rootFixtures.defineWorkerFixtures<BuiltinWorkerFixtures>({
  testWorkerIndex: async function*() {
    // Worker injects the value for this one.
    yield 0;
  }
}).defineTestFixtures<BuiltinTestFixtures>({
  testInfo: async function*() {
    // Worker injects the value for this one.
    yield undefined as any;
  },

  testParametersPathSegment: async function*() {
    yield '';
  },
});
