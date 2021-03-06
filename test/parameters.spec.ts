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

it('should run with each configuration', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'fixtures.js': `
      exports.toBeRenamed = { parameters: {
        foo: { description: 'Foo parameter', defaultValue: 'foo', values: ['foo1', 'foo2', 'foo3'] },
        bar: { description: 'Bar parameter', defaultValue: 'bar', values: ['bar1', 'bar2'] },
      } };
    `,
    'a.test.ts': `
      test('runs 6 times', (test, parameters) => {
        test.skip(parameters.foo === 'foo1' && parameters.bar === 'bar1');
      }, async ({ foo, bar }) => {
        expect(foo).toContain('foo');
        expect(bar).toContain('bar');
        console.log(foo + ':' + bar);
      });
    `
  });

  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(5);  // 6 total, one skipped
  const parametersList = result.report.suites[0].suites[0].specs[0].tests.map(r => r.parameters);
  for (const foo of ['foo1', 'foo2', 'foo3']) {
    for (const bar of ['bar1', 'bar2']) {
      expect(parametersList.find(o => o.foo === foo && o.bar === bar)).toBeTruthy();
      if (foo !== 'foo1' && bar !== 'bar1')
        expect(result.output).toContain(`${foo}:${bar}`);
    }
  }
});

it('should throw on duplicate parameters', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'one.fixtures.js': `
      exports.toBeRenamed = { parameters: {
        foo: { description: 'Foo parameter', defaultValue: 'foo', values: ['foo1', 'foo2', 'foo3'] },
      } };
    `,
    'two.fixtures.js': `
      exports.toBeRenamed = { parameters: {
        foo: { description: 'Foo parameter 2', defaultValue: 'foo', values: ['foo1', 'foo2', 'foo3'] },
      } };
    `,
    'a.spec.ts': `
      test('success', async ({}) => {
      });
    `
  });
  expect(result.exitCode).toBe(1);
  expect(result.output).toContain('two.fixtures.js');
  expect(result.output).toContain(`Parameter "foo" has been already registered`);
});

it('should use kebab for CLI name', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'one.fixtures.js': `
      exports.toBeRenamed = { parameters: {
        fooCamelCase: { description: 'Foo parameter', defaultValue: 'foo' },
      } };
    `,
    'a.test.ts': `
      test('test', async ({ fooCamelCase }) => {
        expect(fooCamelCase).toBe('kebab-value');
      });
    `
  }, { 'param': 'fooCamelCase=kebab-value' });
  expect(result.exitCode).toBe(0);
});

it('should show parameters descriptions', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'one.fixtures.js': `
      exports.toBeRenamed = { parameters: {
        browserName: { description: 'Browser name', defaultValue: 'chromium' },
        headful: { description: 'Whether to show browser window or not', defaultValue: false },
      } };
    `,
    'a.test.ts': `
      test('should work', () => {});
    `
  }, { 'help': true });
  expect(result.output).toContain(`-p, --param browserName=<value>`);
  expect(result.output).toContain(`Browser name (default: "chromium")`);
  expect(result.output).toContain(`-p, --param headful`);
  expect(result.output).toContain(`Whether to show browser window or not`);

  expect(result.exitCode).toBe(0);
});

it('should support integer parameter', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'one.fixtures.js': `
      exports.toBeRenamed = { parameters: {
        integer: { description: 'Some interger', defaultValue: 5 },
      } };
    `,
    'a.test.ts': `
      test('success', async ({integer}) => {
        expect(integer).toBe(6);
      });
    `
  }, { 'param': 'integer=6' });
  expect(result.exitCode).toBe(0);
});

it('should support boolean parameter', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'one.fixtures.js': `
      exports.toBeRenamed = { parameters: {
        bool: { description: 'Some bool', defaultValue: false },
      } };
    `,
    'a.test.ts': `
      test('success', async ({bool}) => {
        expect(bool).toBe(true);
      });
    `
  }, { 'param': 'bool' });
  expect(result.exitCode).toBe(0);
});

it('should generate tests from CLI', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'one.fixtures.js': `
      exports.toBeRenamed = { parameters: {
        bool: { description: 'Some bool', defaultValue: false },
      } };
    `,
    'a.test.ts': `
      test('success', async ({bool}) => {
        expect(bool).toBe(true);
      });
    `
  }, { 'param': ['bool=true', 'bool=false'] });
  expect(result.exitCode).toBe(1);
  expect(result.results.length).toBe(2);
  expect(result.passed).toBe(1);
  expect(result.failed).toBe(1);
});

it('tests respect automatic fixture parameters', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'one.fixtures.js': `
      async function automaticTestFixture({param}, runTest) {
        await runTest(param);
      }
      exports.toBeRenamed = {
        parameters: {
          param: { description: 'Some param', defaultValue: 'value' },
        },
        autoTestFixtures: {
          automaticTestFixture
        },
      };
    `,
    'a.test.js': `
      test('test 1', async ({}) => {
        expect(1).toBe(1);
      });
    `
  });
  expect(result.exitCode).toBe(0);
  expect(result.report.suites[0].suites[0].specs[0].tests[0].parameters).toEqual({ param: 'value' });
});

it('should not duplicate parameters in configuration', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'one.fixtures.js': `
      async function f1({foo}, runTest) {
        await runTest(foo);
      }
      async function f2({foo}, runTest) {
        await runTest(foo);
      }
      exports.toBeRenamed = {
        parameters: {
          foo: { description: 'Foo', defaultValue: 'foo', values: ['foo1', 'foo2', 'foo3'] },
        },
        testFixtures: {
          f1, f2
        },
      };
    `,
    'a.test.ts': `
      test('runs 3 times', async ({ f1, f2 }) => {
        expect(f1).toContain('foo');
        expect(f2).toContain('foo');
        expect(f1).toBe(f2);
        console.log(f1 + ':' + f2);
      });
    `
  });

  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(3);
  const outputs = result.results.map(r => r.stdout[0].text.replace(/\s/g, ''));
  expect(outputs.sort()).toEqual(['foo1:foo1', 'foo2:foo2', 'foo3:foo3']);
});

it('should generate tests when parameters are in beforeEach', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'one.fixtures.js': `
      exports.toBeRenamed = {
        parameters: {
          foo: { description: 'Foo', defaultValue: 'foo', values: ['foo1', 'foo2', 'foo3'] },
        },
      };
    `,
    'a.test.js': `
      test.describe('suite', () => {
        let fooValue;
        test.beforeEach(({ foo }) => {
          fooValue = foo;
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
