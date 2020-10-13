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

import { folio } from './fixtures';
const { it, expect } = folio;

it('should fail', async ({ runTest }) => {
  const result = await runTest('one-failure.ts');
  expect(result.exitCode).toBe(1);
  expect(result.passed).toBe(0);
  expect(result.failed).toBe(1);
  expect(result.output).toContain('1) one-failure.ts:19');
});

it('should timeout', async ({ runTest }) => {
  const { exitCode, passed, failed, output } = await runTest('one-timeout.js', { timeout: 100 });
  expect(exitCode).toBe(1);
  expect(passed).toBe(0);
  expect(failed).toBe(1);
  expect(output).toContain('Timeout of 100ms exceeded.');
});

it('should succeed', async ({ runTest }) => {
  const result = await runTest('one-success.js');
  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(1);
  expect(result.failed).toBe(0);
});

it('should report suite errors', async ({ runTest }) => {
  const { exitCode, failed, output } = await runTest('suite-error.js');
  expect(exitCode).toBe(1);
  expect(failed).toBe(1);
  expect(output).toContain('Suite error');
});

it('should respect nested skip', async ({ runTest }) => {
  const { exitCode, passed, failed, skipped } = await runTest('nested-skip.js');
  expect(exitCode).toBe(0);
  expect(passed).toBe(0);
  expect(failed).toBe(0);
  expect(skipped).toBe(1);
});

it('should respect slow test', async ({ runTest }) => {
  const { exitCode, output } = await runTest('slow.js', { timeout: 1 });
  expect(output).toContain('Timeout of 3ms exceeded');
  expect(exitCode).toBe(1);
});

it('should respect excluded tests', async ({ runTest }) => {
  const { exitCode, passed } = await runTest('excluded.ts');
  expect(passed).toBe(2);
  expect(exitCode).toBe(0);
});

it('should respect focused tests', async ({ runTest }) => {
  const { exitCode, passed } = await runTest('focused.ts');
  expect(passed).toBe(5);
  expect(exitCode).toBe(0);
});
