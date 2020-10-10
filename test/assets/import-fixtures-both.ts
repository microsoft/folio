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

import { fixtures1 } from './export-1.fixtures';
import { fixtures2 } from './export-2.fixtures';

const fixtures = fixtures1.union(fixtures2);
const { it, expect } = fixtures.overrideTestFixtures({
  testWrap: async function*() {
    yield 'override';
  }
}).overrideWorkerFixtures({
  workerTypeOnly: async function*() {
    yield 17;
  }
});

it('ensure that overrides work', async ({ testTypeOnly, workerTypeOnly, testWrap, workerWrap }) => {
  expect(testWrap).toBe('override');
  expect(workerWrap).toBe(42);
  expect(testTypeOnly).toBe('testTypeOnly');
  expect(workerTypeOnly).toBe(17);
});
