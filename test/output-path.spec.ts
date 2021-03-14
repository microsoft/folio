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

it('should include repeat token', async ({runInlineTest}) => {
  const result = await runInlineTest({
    'a.spec.js': `
      test('test', ({testInfo}) => {
        if (testInfo.repeatEachIndex)
          expect(testInfo.outputPath('')).toContain('repeat' + testInfo.repeatEachIndex);
        else
          expect(testInfo.outputPath('')).not.toContain('repeat' + testInfo.repeatEachIndex);
      });
    `
  }, { 'repeat-each': 3 });
  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(3);
});

it('should include retry token', async ({runInlineTest}) => {
  const result = await runInlineTest({
    'a.spec.js': `
      test('test', ({testInfo}) => {
        expect(testInfo.outputPath('')).toContain('retry' + testInfo.retry);
        expect(testInfo.retry).toBe(2);
      });
    `
  }, { 'retries': 2 });
  expect(result.exitCode).toBe(0);
  expect(result.flaky).toBe(1);
});
