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
import { firstStackFrame, folio, stripAscii } from './fixtures';
const { it, expect } = folio;

it('hooks should work with env', async ({ runInlineTest }) => {
  const { results } = await runInlineTest({
    'folio.config.ts': `
      global.logs = [];
      class MyEnv {
        async beforeAll() {
          global.logs.push('+w');
        }
        async afterAll() {
          global.logs.push('-w');
        }
        async beforeEach() {
          global.logs.push('+t');
          return { w: 17, t: 42 };
        }
        async afterEach() {
          global.logs.push('-t');
        }
      }
      export const test = folio.newTestType();
      export const suite = test.runWith(new MyEnv());
    `,
    'a.test.js': `
      const { test } = require('./folio.config');
      test.describe('suite', () => {
        test.beforeAll(async () => {
          global.logs.push('beforeAll');
        });
        test.afterAll(async () => {
          global.logs.push('afterAll');
        });

        test.beforeEach(async ({w, t}) => {
          global.logs.push('beforeEach-' + w + '-' + t);
        });
        test.afterEach(async ({w, t}) => {
          global.logs.push('afterEach-' + w + '-' + t);
        });

        test('one', async ({w, t}) => {
          global.logs.push('test');
          expect(w).toBe(17);
          expect(t).toBe(42);
        });
      });

      test('two', async () => {
        expect(global.logs).toEqual([
          '+w',
          'beforeAll',
          '+t',
          'beforeEach-17-42',
          'test',
          'afterEach-17-42',
          '-t',
          'afterAll',
          '+t',
        ]);
      });
    `,
  });
  expect(results[0].status).toBe('passed');
});

it('afterEach failure should not prevent other hooks and env teardown', async ({ runInlineTest }) => {
  const report = await runInlineTest({
    'folio.config.ts': `
      global.logs = [];
      class MyEnv {
        async beforeEach() {
          console.log('+t');
        }
        async afterEach() {
          console.log('-t');
        }
      }
      export const test = folio.newTestType();
      export const suite = test.runWith(new MyEnv());
    `,
    'a.test.js': `
      const { test } = require('./folio.config');
      test.describe('suite', () => {
        test.afterEach(async () => {
          console.log('afterEach1');
        });
        test.afterEach(async () => {
          console.log('afterEach2');
          throw new Error('afterEach2');
        });
        test('one', async () => {
          console.log('test');
          expect(true).toBe(true);
        });
      });
    `,
  });
  expect(report.output).toContain('+t\ntest\nafterEach2\nafterEach1\n-t');
  expect(report.results[0].error.message).toContain('afterEach2');
});

it('beforeEach failure should prevent the test, but not other hooks', async ({ runInlineTest }) => {
  const report = await runInlineTest({
    'a.test.js': `
      test.describe('suite', () => {
        test.beforeEach(async ({}) => {
          console.log('beforeEach1');
        });
        test.beforeEach(async ({}) => {
          console.log('beforeEach2');
          throw new Error('beforeEach2');
        });
        test.afterEach(async ({}) => {
          console.log('afterEach');
        });
        test('one', async ({}) => {
          console.log('test');
        });
      });
    `,
  });
  expect(report.output).toContain('beforeEach1\nbeforeEach2\nafterEach');
  expect(report.results[0].error.message).toContain('beforeEach2');
});

it('beforeAll should be run once', async ({ runInlineTest }) => {
  const report = await runInlineTest({
    'a.test.js': `
      test.describe('suite1', () => {
        let counter = 0;
        test.beforeAll(async () => {
          console.log('beforeAll1-' + (++counter));
        });
        test.describe('suite2', () => {
          test.beforeAll(async () => {
            console.log('beforeAll2');
          });
          test('one', async ({}) => {
            console.log('test');
          });
        });
      });
    `,
  });
  expect(report.output).toContain('beforeAll1-1\nbeforeAll2\ntest');
});
