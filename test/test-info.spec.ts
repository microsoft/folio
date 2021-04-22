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

import { test, expect } from './config';

test('should work directly', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'a.test.js': `
      test('test 1', async ({}, testInfo) => {
        expect(testInfo.title).toBe('test 1');
      });
      test('test 2', async ({}, testInfo) => {
        expect(testInfo.title).toBe('test 2');
      });
    `,
  });
  expect(result.exitCode).toBe(0);
});

test('should work via env', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'folio.config.ts': `
      class MyEnv {
        async beforeEach(args, testInfo) {
          return { title: testInfo.title };
        }
      }
      export const test = folio.test;
      test.runWith(new MyEnv());
    `,
    'a.test.js': `
      const { test } = require('./folio.config');
      test('test 1', async ({title}) => {
        expect(title).toBe('test 1');
      });
      test('test 2', async ({title}) => {
        expect(title).toBe('test 2');
      });
    `,
  });
  expect(result.exitCode).toBe(0);
});
