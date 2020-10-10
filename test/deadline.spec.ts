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

it('should expose deadline', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'a.spec.ts': `
      function monotonicTime(): number {
        const [seconds, nanoseconds] = process.hrtime();
        return seconds * 1000 + (nanoseconds / 1000000 | 0);
      }

      it('fixture timeout', test => {
        test.setTimeout(10000);
      }, async ({testInfo}) => {
        expect(testInfo.deadline).toBeGreaterThan(monotonicTime());
        expect(testInfo.deadline).toBeLessThan(monotonicTime() + 20000);
      });
    `
  });
  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(1);
});
