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

it('should shard workers by fixtures', async ({ runTest }) => {
  const result = await runTest('worker-fixture-combination.js');
  expect(result.passed).toBe(3);
  expect(result.exitCode).toBe(0);
  expect(result.output).toContain('test that does not use fixtures');
  expect(result.output).toContain('test that uses fixture');
  expect(result.output).toContain('another test that uses fixture');
});
