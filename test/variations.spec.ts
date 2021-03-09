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

it('should run in each variation', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'one.fixtures.js': `
      function configureSuite(suite) {
        suite.vary('foo', ['foo1', 'foo2', 'foo3']);
        suite.vary('bar', ['bar1', 'bar2']);
      }
      exports.toBeRenamed = { configureSuite };
    `,
    'two.fixtures.js': `
      function configureSuite(suite) {
        suite.vary('baz', ['baz1', 'baz2']);
      }
      exports.toBeRenamed = { configureSuite };
    `,
    'a.test.ts': `
      test('runs 12 times', (test, variation) => {
        test.skip(variation.foo === 'foo1' && variation.bar === 'bar1' && variation.baz === 'baz1');
      }, async ({ testInfo }) => {
        const { foo, bar, baz } = testInfo.variation;
        expect(foo).toContain('foo');
        expect(bar).toContain('bar');
        expect(bar).toContain('bar');
        console.log(foo + ':' + bar + ':' + baz);
      });
    `
  });

  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(11);  // 12 total, one skipped
  const variationsList = result.report.suites[0].specs[0].tests.map(r => r.variation);
  for (const foo of ['foo1', 'foo2', 'foo3']) {
    for (const bar of ['bar1', 'bar2']) {
      for (const baz of ['baz1', 'baz2']) {
        expect(variationsList.find(o => o.foo === foo && o.bar === bar && o.baz === baz)).toBeTruthy();
        if (foo !== 'foo1' || bar !== 'bar1' || baz !== 'baz1')
          expect(result.output).toContain(`${foo}:${bar}:${baz}`);
      }
    }
  }
});

it('should throw on duplicate parameters', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'one.fixtures.js': `
      function configureSuite(suite) {
        suite.vary('foo', ['foo1', 'foo2', 'foo3']);
      }
      exports.toBeRenamed = { configureSuite };
    `,
    'two.fixtures.js': `
      function configureSuite(suite) {
        suite.vary('foo', ['foo5']);
      }
      exports.toBeRenamed = { configureSuite };
    `,
    'a.spec.ts': `
      test('success', async ({}) => {
      });
    `
  });
  expect(result.exitCode).toBe(1);
  expect(result.output).toContain('two.fixtures.js:5');
  expect(result.output).toContain(`Duplicate variation key "foo"`);
});

it('should provide variation in beforeEach', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'one.fixtures.js': `
      function configureSuite(suite) {
        suite.vary('foo', ['foo1', 'foo2', 'foo3']);
      }
      exports.toBeRenamed = { configureSuite };
    `,
    'a.test.js': `
      test.describe('suite', () => {
        let fooValue;
        test.beforeEach(({ testInfo }) => {
          fooValue = testInfo.variation.foo;
        });
        test('runs 3 times', async ({}) => {
          console.log(fooValue);
        });
      });
    `
  });

  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(3);
  const outputs = result.results.map(r => r.stdout[0].text.replace(/\s/g, ''));
  expect(outputs.sort()).toEqual(['foo1', 'foo2', 'foo3']);
});

it('should not reuse worker for different variations', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'one.fixtures.js': `
      function configureSuite(suite) {
        suite.vary('param', ['value1', 'value2']);
      }
      exports.toBeRenamed = { configureSuite };
    `,
    'a.test.js': `
      test('succeeds', async ({ testInfo, testWorkerIndex }) => {
        expect(testWorkerIndex).toBe(testInfo.variation.param === 'value1' ? 0 : 1);
      });
    `,
  });
  expect(result.passed).toBe(2);
  expect(result.exitCode).toBe(0);
});
