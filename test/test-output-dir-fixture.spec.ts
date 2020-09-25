/**
 * Copyright Microsoft Corporation. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { expect } from '@playwright/test-runner';
import { fixtures } from './fixtures';
const { it } = fixtures;

it('should work and remove empty dir', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'my-test!.spec.js': `
      let dir;
      it('test 1', async ({testOutputDir, testInfo}) => {
        dir = testOutputDir;
        if (testInfo.retry)
          expect(testOutputDir).toContain(require('path').join('my-test!', 'test_1_retry1'));
        else
          expect(testOutputDir).toContain(require('path').join('my-test!', 'test_1'));
        expect(require('fs').existsSync(testOutputDir)).toBe(true);
        expect(testInfo.retry).toBe(1);
      });
    `,
  }, { retries: 10 });
  expect(result.exitCode).toBe(1);
  expect(result.results[0].status).toBe('failed');
  expect(result.results[0].retry).toBe(0);
  expect(result.results[1].status).toBe('passed');
  expect(result.results[1].retry).toBe(1);
});
