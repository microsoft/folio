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

import { fixtures } from './fixtures';
const { it, expect } = fixtures;

it('should run with each configuration', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'a.test.ts': `
      const fixtures = baseFixtures.declareParameters<{ foo: string, bar: string }>();
      fixtures.defineParameter('foo', 'Foo parameters', 'foo');
      fixtures.defineParameter('bar', 'Bar parameters', 'bar');
      fixtures.generateParametrizedTests('foo', ['foo1', 'foo2', 'foo3']);
      fixtures.generateParametrizedTests('bar', ['bar1', 'bar2']);

      const { it } = fixtures;

      it('runs 6 times', (test, parameters) => {
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
  const parametersList = result.report.suites[0].specs[0].tests.map(r => r.parameters);
  for (const foo of ['foo1', 'foo2', 'foo3']) {
    for (const bar of ['bar1', 'bar2']) {
      expect(parametersList.find(o => o.foo === foo && o.bar === bar)).toBeTruthy();
      if (foo !== 'foo1' && bar !== 'bar1')
        expect(result.output).toContain(`${foo}:${bar}`);
    }
  }
});

it('should fail on invalid parameters', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'a.spec.ts': `
      fixtures.generateParametrizedTests('invalid', ['value']);

      it('success', async ({}) => {
      });
    `
  });
  expect(result.exitCode).toBe(1);
  expect(result.output).toContain('a.spec.ts');
  expect(result.output).toContain(`Unregistered parameter 'invalid' was set.`);
});

it('should use kebab for CLI name', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'a.test.ts': `
      const fixtures = baseFixtures.declareParameters<{ fooCamelCase: string }>();
      fixtures.defineParameter('fooCamelCase', 'Foo parameters', 'foo');

      const { it } = fixtures;

      it('test', async ({ fooCamelCase }) => {
        expect(fooCamelCase).toBe('kebab-value');
      });
    `
  }, { 'param': 'fooCamelCase=kebab-value' });
  expect(result.exitCode).toBe(0);
});

it('should respect boolean CLI option', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'a.test.ts': `
      const fixtures = baseFixtures.declareParameters<{ fooCamelCase: boolean }>();
      fixtures.defineParameter('fooCamelCase', 'Foo parameters', false);
      const { it } = fixtures;
      it('test', async ({ fooCamelCase }) => {
        expect(fooCamelCase).toBeTruthy();
      });
    `
  }, { 'param': 'fooCamelCase' });
  expect(result.exitCode).toBe(0);
});

it('should show parameters descriptions', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'a.test.ts': `
      const fixtures = baseFixtures.declareParameters<{ browserName: string, headful: boolean }>();
      fixtures.defineParameter('browserName', 'Browser name', 'chromium');
      fixtures.defineParameter('headful', 'Whether to show browser window or not', false);
    `
  }, { 'help': true });
  expect(result.output).toContain(`-p, --param browserName=<value>`);
  expect(result.output).toContain(`Browser name (default: "chromium")`);
  expect(result.output).toContain(`-p, --param headful`);
  expect(result.output).toContain(`Whether to show browser window or not`);

  expect(result.exitCode).toBe(0);
});

it('should support integer parameter', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'a.test.ts': `
      const fixtures = baseFixtures.declareParameters<{ integer: number }>();
      fixtures.defineParameter('integer', 'Some integer', 5);
      const { it } = fixtures;
      it('success', async ({integer}) => {
        expect(integer).toBe(6);
      });
    `
  }, { 'param': 'integer=6' });
  expect(result.exitCode).toBe(0);
});

it('should support boolean parameter', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'a.test.ts': `
      const fixtures = baseFixtures.declareParameters<{ bool: boolean }>();
      fixtures.defineParameter('bool', 'Some bool', false);
      const { it } = fixtures;
      it('success', async ({bool}) => {
        expect(bool).toBe(true);
      });
    `
  }, { 'param': 'bool' });
  expect(result.exitCode).toBe(0);
});

it('should generate tests from CLI', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'a.test.ts': `
      const fixtures = baseFixtures.declareParameters<{ bool: boolean }>();
      fixtures.defineParameter('bool', 'Some bool', false);
      const { it } = fixtures;
      it('success', async ({bool}) => {
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
    'a.test.js': `
      fixtures.defineParameter('param', 'Some param', 'value');
      fixtures.defineTestFixture('automaticTestFixture', async ({param}, runTest) => {
        await runTest(param);
      }, { auto: true  });
      it('test 1', async ({}) => {
        expect(1).toBe(1);
      });
    `
  });
  expect(result.exitCode).toBe(0);
  expect(result.report.suites[0].specs[0].tests[0].parameters).toEqual({ param: 'value' });
});
