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

import { test, expect } from './folio-test';

test('should merge options', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'a.test.ts': `
      class MyEnv {
        async beforeEach(args) {
          return { foo: args.foo || 'foo', bar: args.bar || 'bar' };
        }
      }
      const test = folio.test.extend(new MyEnv());

      test.useOptions({ foo: 'foo2' });
      test.useOptions({ bar: 'bar2' });
      test('test', ({ foo, bar }) => {
        expect(foo).toBe('foo2');
        expect(bar).toBe('bar2');
      });
    `
  });
  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(1);
});

test('should run tests with different test options in the same worker', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'helper.ts': `
      global.logs = [];
      class MyEnv {
        async beforeEach(args) {
          return { foo: args.foo || 'foo' };
        }
      }
      export const test = folio.test.extend(new MyEnv());
    `,
    'a.test.ts': `
      import { test } from './helper';
      test('test', ({ foo }, testInfo) => {
        expect(foo).toBe('foo');
        expect(testInfo.workerIndex).toBe(0);
      });

      test.describe('suite1', () => {
        test.useOptions({ foo: 'bar' });
        test('test1', ({ foo }, testInfo) => {
          expect(foo).toBe('bar');
          expect(testInfo.workerIndex).toBe(0);
        });

        test.describe('suite2', () => {
          test.useOptions({ foo: 'baz' });
          test('test2', ({ foo }, testInfo) => {
            expect(foo).toBe('baz');
            expect(testInfo.workerIndex).toBe(0);
          });
        });
      });
    `
  }, { workers: 1 });
  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(3);
});

test('should run tests with different worker options', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'helper.ts': `
      class MyEnv {
        hasBeforeAllOptions(options) {
          return 'foo' in options;
        }
        async beforeAll(options) {
          return { foo: options.foo };
        }
      }
      export const test = folio.test.extend(new MyEnv());
    `,
    'a.test.ts': `
      import { test } from './helper';
      test('test', ({ foo }, testInfo) => {
        expect(foo).toBe(undefined);
        expect(testInfo.workerIndex).toBe(0);
      });

      test.describe('suite1', () => {
        test.useOptions({ foo: 'bar' });
        test('test1', ({ foo }, testInfo) => {
          expect(foo).toBe('bar');
          expect(testInfo.workerIndex).toBe(1);
        });

        test.describe('suite2', () => {
          test.useOptions({ foo: 'baz' });
          test('test2', ({ foo }, testInfo) => {
            expect(foo).toBe('baz');
            expect(testInfo.workerIndex).toBe(2);
          });
        });

        test('test3', ({ foo }, testInfo) => {
          expect(foo).toBe('bar');
          expect(testInfo.workerIndex).toBe(1);
        });
      });
    `,
    'b.test.ts': `
      import { test } from './helper';
      test.useOptions({ foo: 'qux' });
      test('test4', ({ foo }, testInfo) => {
        expect(foo).toBe('qux');
        expect(testInfo.workerIndex).toBe(3);
      });
    `
  }, { workers: 1 });
  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(5);
});
