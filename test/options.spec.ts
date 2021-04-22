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

import { test, expect } from './config';

test('should run tests with different options', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'folio.config.ts': `
      global.logs = [];
      class MyEnv {
        async setupTest(args) {
          return { foo: args.foo || 'foo' };
        }
      }
      export const test = folio.test;
      test.runWith(new MyEnv());
    `,
    'a.test.ts': `
      import { test } from './folio.config';
      test('test', ({ foo }) => {
        expect(foo).toBe('foo');
      });

      test.describe('suite1', () => {
        test.useOptions({ foo: 'bar' });
        test('test1', ({ foo }) => {
          expect(foo).toBe('bar');
        });

        test.describe('suite2', () => {
          test.useOptions({ foo: 'baz' });
          test('test2', ({ foo }) => {
            expect(foo).toBe('baz');
          });
        });
      });
    `
  });
  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(3);
});
