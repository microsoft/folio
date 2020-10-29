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

it('should run fixture tear down on timeout', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'c.spec.ts': `
      const builder = baseFolio.extend();
      builder.foo.init(async ({ testInfo }, runTest) => {
        await runTest();
        console.log('STATUS:' + testInfo.status);
      });
      const { it } = builder.build();
      it('works', async ({ foo }) => {
        await new Promise(f => setTimeout(f, 100000));
      });
    `
  }, { timeout: 1000 });
  expect(result.exitCode).toBe(1);
  expect(result.failed).toBe(1);
  expect(result.output).toContain('STATUS:timedOut');
});
