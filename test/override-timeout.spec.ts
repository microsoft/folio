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

it('should consider dynamically set value', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'fixtures.js': `
      config.timeout = 100;
      exports.toBeRenamed = {};
    `,
    'a.test.js': `
      test('pass', ({ testInfo }) => {
        expect(testInfo.timeout).toBe(100);
      })
    `
  });
  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(1);
});

it('should prioritize value set via command line', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'fixtures.js': `
      config.timeout = 100;
      exports.toBeRenamed = {};
    `,
    'a.test.js': `
      test('pass', ({ testInfo }) => {
        expect(testInfo.timeout).toBe(1000);
      })
    `
  }, { timeout: 1000 });
  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(1);
});
