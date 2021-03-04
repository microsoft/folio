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

it('should be able to import/export fixtures', async ({ runInlineFixturesTest }) => {
  const { exitCode, passed } = await runInlineFixturesTest({
    'export-1.fixtures.ts': `
      const fixtures = baseFolio.extend<{ testWrap: string }, { workerWrap: number }>();

      fixtures.testWrap.init(async ({}, runTest) => {
        await runTest('testWrap');
      });

      fixtures.workerWrap.init(async ({}, runTest) => {
        await runTest(42);
      }, { scope: 'worker' });

      export const folio = fixtures.build();
    `,
    'export-2.fixtures.ts': `
      const fixtures = baseFolio.extend<{ testTypeOnly: string }, { workerTypeOnly: number }>();

      fixtures.testTypeOnly.init(async ({}, runTest) => {
        await runTest('testTypeOnly');
      });

      fixtures.workerTypeOnly.init(async ({}, runTest) => {
        await runTest(42);
      }, { scope: 'worker' });

      export const folio = fixtures.build();
    `,
    'import-fixtures-both.spec.ts': `
      import { folio as folio1 } from './export-1.fixtures';
      import { folio as folio2 } from './export-2.fixtures';

      const fixtures = folio1.union(folio2).extend();

      fixtures.testWrap.override(async ({}, runTest) => {
        await runTest('override');
      });

      fixtures.workerTypeOnly.override(async ({}, runTest) => {
        await runTest(17);
      });
      const { it } = fixtures.build();

      it('ensure that overrides work', async ({ testTypeOnly, workerTypeOnly, testWrap, workerWrap }) => {
        expect(testWrap).toBe('override');
        expect(workerWrap).toBe(42);
        expect(testTypeOnly).toBe('testTypeOnly');
        expect(workerTypeOnly).toBe(17);
      });
    `
  });
  expect(passed).toBe(1);
  expect(exitCode).toBe(0);
});

// TODO: add tests for tsc enforcing various fixture types.
