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

it('should be able to redefine config', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'folio.config.ts': `
      folio.setConfig({ timeout: 12345 });
      export const test = folio.newTestType();
      test.runWith();
    `,
    'a.test.ts': `
      import { test } from './folio.config';
      test('pass', async ({}, testInfo) => {
        expect(testInfo.timeout).toBe(12345);
      });
    `
  });

  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(1);
});

it('should read config from --config', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'my.config.ts': `
      import * as path from 'path';
      folio.setConfig({
        testDir: path.join(__dirname, 'dir'),
      });
      export const test = folio.newTestType();
      test.runWith();
    `,
    'a.test.ts': `
      import { test } from './my.config';
      test('ignored', async ({}) => {
      });
    `,
    'dir/b.test.ts': `
      import { test } from '../my.config';
      test('run', async ({}) => {
      });
    `,
  }, { config: 'my.config.ts' });

  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(1);
  expect(result.report.suites.length).toBe(1);
  expect(result.report.suites[0].file).toBe('b.test.ts');
});
