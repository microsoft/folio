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

it('hooks should work with fixtures', async ({ runInlineTest }) => {
  const { results } = await runInlineTest({
    'fixtures.ts': `
      global.logs = [];
      async function w({}, runTest) {
        global.logs.push('+w');
        await runTest(17);
        global.logs.push('-w');
      }
      async function t({}, runTest) {
        global.logs.push('+t');
        await runTest(42);
        global.logs.push('-t');
      }
      export const toBeRenamed = { workerFixtures: { w }, testFixtures: { t } };
    `,
    'a.test.js': `
      test.describe('suite', () => {
        test.beforeAll(async ({w}) => {
          global.logs.push('beforeAll-' + w);
        });
        test.afterAll(async ({w}) => {
          global.logs.push('afterAll-' + w);
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

      test('two', async ({w}) => {
        expect(global.logs).toEqual([
          '+w',
          'beforeAll-17',
          '+t',
          'beforeEach-17-42',
          'test',
          'afterEach-17-42',
          '-t',
          'afterAll-17',
        ]);
      });
    `,
  });
  expect(results[0].status).toBe('passed');
});

it('afterEach failure should not prevent other hooks and fixture teardown', async ({ runInlineTest }) => {
  const report = await runInlineTest({
    'fixtures.ts': `
      async function t({}, runTest) {
        console.log('+t');
        await runTest(42);
        console.log('-t');
      }
      export const toBeRenamed = { testFixtures: { t } };
    `,
    'a.test.js': `
      test.describe('suite', () => {
        test.afterEach(async ({}) => {
          console.log('afterEach1');
        });
        test.afterEach(async ({}) => {
          console.log('afterEach2');
          throw new Error('afterEach2');
        });
        test('one', async ({t}) => {
          console.log('test');
          expect(t).toBe(42);
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

it('should throw when hook depends on unknown fixture', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'a.spec.ts': `
      test.describe('suite', () => {
        test.beforeEach(async ({foo}) => {});
        test('works', async ({}) => {});
      });
    `,
  });
  expect(stripAscii(result.output)).toContain('beforeEach hook has unknown parameter "foo".');
  expect(firstStackFrame(stripAscii(result.output))).toContain('a.spec.ts:6');
  expect(result.exitCode).toBe(1);
});

it('should throw when beforeAll hook depends on test fixture', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'fixtures.ts': `
      async function foo({}, runTest) {
        await runTest(42);
      }
      export const toBeRenamed = { testFixtures: { foo } };
    `,
    'a.spec.ts': `
      test.describe('suite', () => {
        test.beforeAll(async ({foo}) => {});
        test('works', async ({foo}) => {});
      });
    `,
  });
  expect(stripAscii(result.output)).toContain('beforeAll hook cannot depend on a test fixture "foo".');
  expect(firstStackFrame(stripAscii(result.output))).toContain('a.spec.ts:6');
  expect(result.exitCode).toBe(1);
});

it('should throw when afterAll hook depends on test fixture', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'fixtures.ts': `
      async function foo({}, runTest) {
        await runTest(42);
      }
      export const toBeRenamed = { testFixtures: { foo } };
    `,
    'a.spec.ts': `
      test.describe('suite', () => {
        test.afterAll(async ({foo}) => {});
        test('works', async ({foo}) => {});
      });
    `,
  });
  expect(stripAscii(result.output)).toContain('afterAll hook cannot depend on a test fixture "foo".');
  expect(firstStackFrame(stripAscii(result.output))).toContain('a.spec.ts:6');
  expect(result.exitCode).toBe(1);
});
