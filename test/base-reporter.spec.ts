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

import { fixtures, stripAscii } from './fixtures';
const { it, expect } = fixtures;

it('handle long test names', async ({ runInlineTest }) => {
  const title = 'title'.repeat(30);
  const result = await runInlineTest({
    'a.test.js': `
      it('${title}', async ({}) => {
        expect(1).toBe(0);
      });
    `,
  });
  expect(stripAscii(result.output)).toContain('expect(1).toBe');
  expect(result.exitCode).toBe(1);
});
