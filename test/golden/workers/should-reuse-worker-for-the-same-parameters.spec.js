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

const { fixtures, expect } = require('../../..');

const builder = fixtures.extend();
builder.defineWorkerFixture('worker1', ({}, runTest) => runTest());
builder.defineWorkerFixture('worker2', ({}, runTest) => runTest());
const { it } = builder.build();

it('succeeds', async ({ worker1, testWorkerIndex }) => {
  expect(testWorkerIndex).toBe(0);
});

it('succeeds', async ({ worker2, testWorkerIndex }) => {
  expect(testWorkerIndex).toBe(0);
});
