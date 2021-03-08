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

it('should support spec.ok', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'a.test.js': `
      test('math works!', async ({}) => {
        expect(1 + 1).toBe(2);
      });
      test('math fails!', async ({}) => {
        expect(1 + 1).toBe(3);
      });
    `
  }, { });
  expect(result.exitCode).toBe(1);
  expect(result.report.suites[0].specs[0].ok).toBe(true);
  expect(result.report.suites[0].specs[1].ok).toBe(false);
});
