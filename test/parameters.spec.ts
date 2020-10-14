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
      builder.foo.init(['foo1', 'foo2', 'foo3'], 'Foo parameters');
      builder.bar.init(['bar1', 'bar2'], 'Bar parameters');
      const folio = builder.build();

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

it('should throw on duplicate parameters', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'a.spec.ts': `
      const builder1 = baseFolio.extend();
      builder1.foo.init([''], 'Foo');
      const f1 = builder1.build();
      const builder2 = f1.extend();
      builder2.foo.init(['123'], 'Bar');
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

it('tests respect automatic fixture parameters', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'a.test.js': `
      const builder = baseFolio.extend();
      builder.param.init(['value'], 'Some param');
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
      builder.param.init(['value'], 'Some param');
      builder.testParametersPathSegment.override(async ({ param }, runTest) => {
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
      builder.foo.init(['foo1', 'foo2', 'foo3'], 'Foo');
      builder.f1.init(async({foo}, runTest) => runTest(foo));
      builder.f2.init(async({foo}, runTest) => runTest(foo));
      const folio = builder.build();

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

it('should generate tests when parameters are in beforeEach', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'a.test.js': `
      const fixtures = baseFolio.extend();
      fixtures.foo.init(['foo1', 'foo2', 'foo3']);
      const folio = fixtures.build();

      const { it, describe, beforeEach } = folio;

      describe('suite', () => {
        let fooValue;
        beforeEach(({ foo }) => {
          fooValue = foo;
        });
        it('runs 3 times', async ({}) => {
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

it('should use different parameter values in different folios', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'a.test.ts': `
      const builder = baseFolio.extend();
      builder.foo.init(['foo1', 'foo2', 'foo3'], 'Foo');
      const base = builder.build();

      const builder1 = base.extend();
      builder1.foo.override(['bar1', 'bar2']);
      const folio1 = builder1.build();

      const builder2 = base.extend();
      builder2.foo.override(['baz1']);
      const folio2 = builder2.build();

      base.it('runs 3 times', async ({ foo }) => {
        console.log('base:' + foo);
      });
      folio1.it('runs 2 times', async ({ foo }) => {
        console.log('folio1:' + foo);
      });
      folio2.it('runs 1 time', async ({ foo }) => {
        console.log('folio2:' + foo);
      });
    `
  });

  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(6);
  const outputs = result.results.map(r => r.stdout[0].text.replace(/\s/g, ''));
  expect(outputs.sort()).toEqual([
    'base:foo1', 'base:foo2', 'base:foo3',
    'folio1:bar1', 'folio1:bar2',
    'folio2:baz1',
  ]);
});
