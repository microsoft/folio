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

import { fixtures } from './fixtures';
const { it, expect } = fixtures;

it('should run all three tests', async ({ runTest }) => {
  const result = await runTest('test-ignore');
  expect(result.passed).toBe(3);
  expect(result.exitCode).toBe(0);
});

it('should ignore a test', async ({ runTest }) => {
  const result = await runTest('test-ignore', { 'test-ignore': 'b.test.ts' });
  expect(result.passed).toBe(2);
  expect(result.exitCode).toBe(0);
});

it('should filter tests', async ({ runTest }) => {
  const result = await runTest('test-ignore', { 'test-match': 'c.test.*' });
  expect(result.passed).toBe(1);
});

it('should use a different test match', async ({ runTest }) => {
  const result = await runTest('test-ignore', { 'test-match': '[a|b].test.ts' });
  expect(result.passed).toBe(2);
  expect(result.exitCode).toBe(0);
});
