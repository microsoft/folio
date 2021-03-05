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

it('should be able to import/export fixtures', async ({ runInlineTest }) => {
  const { exitCode, passed } = await runInlineTest({
    'export-1.fixtures.ts': `
      async function testWrap({}, runTest) {
        await runTest('testWrap');
      }

      async function workerWrap({}, runTest) {
        await runTest(42);
      }

      export const toBeRenamed = { testFixtures: { testWrap }, workerFixtures: { workerWrap } };
    `,
    'export-2.fixtures.ts': `
      async function testTypeOnly({}, runTest) {
        await runTest('testTypeOnly');
      }

      async function workerTypeOnly({}, runTest) {
        await runTest(42);
      }

      export const toBeRenamed = { testFixtures: { testTypeOnly }, workerFixtures: { workerTypeOnly } };
    `,
    'import-fixtures-both.spec.ts': `
      it('ensure that overrides work', async ({ testTypeOnly, workerTypeOnly, testWrap, workerWrap }) => {
        expect(testWrap).toBe('testWrap');
        expect(workerWrap).toBe(42);
        expect(testTypeOnly).toBe('testTypeOnly');
        expect(workerTypeOnly).toBe(42);
      });
    `
  });
  expect(passed).toBe(1);
  expect(exitCode).toBe(0);
});

// TODO: add tests for tsc enforcing various fixture types.
