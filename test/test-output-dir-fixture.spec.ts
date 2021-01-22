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
import { expect } from 'folio';
import { folio } from './fixtures';
const { it } = folio;

it('should work and remove empty dir', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'my-test.spec.js': `
      it('test 1', async ({testInfo}) => {
        if (testInfo.retry) {
          expect(testInfo.outputPath('foo', 'bar')).toContain(require('path').join('my-test', 'test-1-retry1', 'foo', 'bar'));
        } else {
          expect(testInfo.outputPath()).toContain(require('path').join('my-test', 'test-1'));
          expect(testInfo.outputPath('foo', 'bar')).toContain(require('path').join('my-test', 'test-1', 'foo', 'bar'));
        }
        expect(require('fs').existsSync(testInfo.outputPath())).toBe(true);
        if (testInfo.retry !== 1)
          throw new Error('Give me a retry');
      });
    `,
  }, { retries: 10 });
  expect(result.exitCode).toBe(0);

  expect(result.results[0].status).toBe('failed');
  expect(result.results[0].retry).toBe(0);
  // Should only fail the last retry check.
  expect(result.results[0].error.message).toBe('Give me a retry');

  expect(result.results[1].status).toBe('passed');
  expect(result.results[1].retry).toBe(1);
});
