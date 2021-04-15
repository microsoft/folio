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

import { test, expect, stripAscii } from './config';

test('render each test with tags', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'folio.config.ts': `
      export const test = folio.test;
      test.runWith({ tag: 'foo' });
      test.runWith({ tag: 'bar' });
    `,
    'a.test.ts': `
      import { test } from './folio.config';
      test('fails', async ({}) => {
        expect(1).toBe(0);
      });
      test('passes', async ({}) => {
        expect(0).toBe(0);
      });
    `,
  }, { reporter: 'list' });
  const text = stripAscii(result.output);
  expect(text).toContain('a.test.ts:6:7 › [foo] fails');
  expect(text).toContain('a.test.ts:6:7 › [bar] fails');
  expect(text).toContain('a.test.ts:9:7 › [foo] passes');
  expect(text).toContain('a.test.ts:9:7 › [bar] passes');
  expect(result.exitCode).toBe(1);
});
