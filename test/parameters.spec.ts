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

it('should run with each configuration', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'a.test.ts': `
      const builder = baseFolio.extend();
      builder.foo.initParameter('Foo parameters', 'foo');
      builder.bar.initParameter('Bar parameters', 'bar');
      const folio = builder.build();
      folio.generateParametrizedTests('foo', ['foo1', 'foo2', 'foo3']);
      folio.generateParametrizedTests('bar', ['bar1', 'bar2']);

      const { it } = folio;

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
      folio.generateParametrizedTests('invalid', ['value']);

      it('success', async ({}) => {
      });
    `
  });
  expect(result.exitCode).toBe(1);
  expect(result.output).toContain('a.spec.ts');
  expect(result.output).toContain(`Unregistered parameter 'invalid' was set.`);
});

it('should throw on duplicate parameters globally', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'a.spec.ts': `
      const builder1 = baseFolio.extend();
      builder1.foo.initParameter('Foo', '');
      const f1 = builder1.build();
      const builder2 = baseFolio.extend();
      builder2.foo.initParameter('Bar', '123');
      const f2 = builder2.build();
      f1.it('success', async ({}) => {
      });
      f2.it('success', async ({}) => {
      });
    `
  });
  expect(result.exitCode).toBe(1);
  expect(result.output).toContain('a.spec.ts:8');
  expect(result.output).toContain(`Parameter "foo" has been already registered`);
});

it('should use kebab for CLI name', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'a.test.ts': `
      const builder = baseFolio.extend();
      builder.fooCamelCase.initParameter('Foo parameters', 'foo');
      const folio = builder.build();

      const { it } = folio;

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
      const builder = baseFolio.extend();
      builder.fooCamelCase.initParameter('Foo parameters', false);
      const fixtures = builder.build();
      const { it } = folio;
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
      const builder = baseFolio.extend();
      builder.browserName.initParameter('Browser name', 'chromium');
      builder.headful.initParameter('Whether to show browser window or not', false);
      const fixtures = builder.build();
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
      const builder = baseFolio.extend();
      builder.integer.initParameter('Some integer', 5);
      const folio = builder.build();
      const { it } = folio;
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
      const builder = baseFolio.extend();
      builder.bool.initParameter('Some bool', false);
      const fixtures = builder.build();
      const { it } = folio;
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
      const builder = baseFolio.extend();
      builder.bool.initParameter('Some bool', false);
      const folio = builder.build();
      const { it } = folio;
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

it('tests respect automatic fixture parameters', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'a.test.js': `
      const builder = baseFolio.extend();
      builder.param.initParameter('Some param', 'value');
      builder.automaticTestFixture.init(async ({param}, runTest) => {
        await runTest(param);
      }, { auto: true });
      const { it } = builder.build();
      it('test 1', async ({}) => {
        expect(1).toBe(1);
      });
    `
  });
  expect(result.exitCode).toBe(0);
  expect(result.report.suites[0].specs[0].tests[0].parameters).toEqual({ param: 'value' });
});

it('testParametersPathSegment does not throw in non-parametrized test', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'a.test.js': `
      const builder = baseFolio.extend();
      builder.param.initParameter('Some param', 'value');
      builder.override('testParametersPathSegment', async ({ param }, runTest) => {
        await runTest(param);
      });
      const { it } = builder.build();
      it('test 1', async ({}) => {
        expect(1).toBe(1);
      });
      it('test 2', async ({param}) => {
        expect(2).toBe(2);
      });
    `
  });
  expect(result.exitCode).toBe(0);
  expect(result.report.suites[0].specs[0].tests[0].parameters).toEqual({});
  expect(result.report.suites[0].specs[1].tests[0].parameters).toEqual({ param: 'value' });
});

it('should not duplicate parameters in configuration', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'a.test.ts': `
      const builder = baseFolio.extend();
      builder.foo.initParameter('Foo', 'foo');
      builder.f1.init(async({foo}, runTest) => runTest(foo));
      builder.f2.init(async({foo}, runTest) => runTest(foo));
      const folio = builder.build();
      folio.generateParametrizedTests('foo', ['foo1', 'foo2', 'foo3']);

      const { it } = folio;

      it('runs 3 times', async ({ f1, f2 }) => {
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
