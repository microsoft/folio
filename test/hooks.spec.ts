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
import { expect } from 'folio';
import { folio } from './fixtures';
const { it } = folio;

it('hooks should work with fixtures', async ({ runInlineFixturesTest }) => {
  const { results } = await runInlineFixturesTest({
    'a.test.js': `
      const logs = [];
      const builder = baseFolio.extend();
      builder.w.init(async ({}, test) => {
        logs.push('+w');
        await test(17);
        logs.push('-w');
      }, { scope: 'worker' });
      builder.t.init(async ({}, test) => {
        logs.push('+t');
        await test(42);
        logs.push('-t');
      });
      const folio = builder.build();

      const { it, describe } = folio;

      describe('suite', () => {
        folio.beforeAll(async ({w}) => {
          logs.push('beforeAll-' + w);
        });
        folio.afterAll(async ({w}) => {
          logs.push('afterAll-' + w);
        });

        folio.beforeEach(async ({w, t}) => {
          logs.push('beforeEach-' + w + '-' + t);
        });
        folio.afterEach(async ({w, t}) => {
          logs.push('afterEach-' + w + '-' + t);
        });

        it('one', async ({w, t}) => {
          logs.push('test');
          expect(w).toBe(17);
          expect(t).toBe(42);
        });
      });

      it('two', async ({w}) => {
        expect(logs).toEqual([
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

it('afterEach failure should not prevent other hooks and fixture teardown', async ({ runInlineFixturesTest }) => {
  const report = await runInlineFixturesTest({
    'a.test.js': `
      const builder = baseFolio.extend();
      builder.t.init(async ({}, test) => {
        console.log('+t');
        await test(42);
        console.log('-t');
      });
      const fixtures = builder.build();
      fixtures.describe('suite', () => {
        fixtures.afterEach(async ({}) => {
          console.log('afterEach1');
        });
        fixtures.afterEach(async ({}) => {
          console.log('afterEach2');
          throw new Error('afterEach2');
        });
        fixtures.it('one', async ({t}) => {
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
      folio.describe('suite', () => {
        folio.beforeEach(async ({}) => {
          console.log('beforeEach1');
        });
        folio.beforeEach(async ({}) => {
          console.log('beforeEach2');
          throw new Error('beforeEach2');
        });
        folio.afterEach(async ({}) => {
          console.log('afterEach');
        });
        it('one', async ({}) => {
          console.log('test');
        });
      });
    `,
  });
  expect(report.output).toContain('beforeEach1\nbeforeEach2\nafterEach');
  expect(report.results[0].error.message).toContain('beforeEach2');
});

it('should throw when hook is called in fixutres file', async ({ runInlineTest }) => {
  const report = await runInlineTest({
    'fixture.js': `
      folio.beforeEach(async ({}) => {});
    `,
    'a.test.js': `
      require('./fixture.js');
      it('test', async ({}) => {
      });
    `,
  });
  expect(report.report.errors[0].error.message).toContain('beforeEach hook should be called inside a describe block. Consider using an auto fixture.');
});

it('should throw when hook is called without describe', async ({ runInlineFixturesTest }) => {
  const report = await runInlineFixturesTest({
    'a.test.js': `
      const { it, beforeEach } = baseFolio;
      beforeEach(async ({}) => {});
      it('test', async ({}) => {
      });
    `,
  });
  expect(report.report.errors[0].error.message).toContain('beforeEach hook should be called inside a describe block. Consider using an auto fixture.');
});

it('should throw when hook depends on unknown fixture', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'a.spec.ts': `
      const { it, beforeEach, describe } = baseFolio;
      describe('suite', () => {
        beforeEach(async ({foo}) => {});
        it('works', async ({}) => {});
      });
    `,
  });
  expect(result.report.errors[0].error.message).toContain('beforeEach hook has unknown parameter "foo".');
  expect(result.report.errors[0].error.stack).toContain('a.spec.ts:5');
  expect(result.exitCode).toBe(1);
});

it('should throw when beforeAll hook depends on test fixture', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'a.spec.ts': `
      const builder = baseFolio.extend();
      builder.foo.init(async ({}, runTest) => {
        await runTest();
      });
      const { it, beforeAll, describe } = builder.build();
      describe('suite', () => {
        beforeAll(async ({foo}) => {});
        it('works', async ({foo}) => {});
      });
    `,
  });
  expect(result.report.errors[0].error.message).toContain('beforeAll hook cannot depend on a test fixture "foo".');
  expect(result.report.errors[0].error.stack).toContain('a.spec.ts:10');
  expect(result.exitCode).toBe(1);
});

it('should throw when afterAll hook depends on test fixture', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'a.spec.ts': `
      const builder = baseFolio.extend();
      builder.foo.init(async ({}, runTest) => {
        await runTest();
      });
      const { it, afterAll, describe } = builder.build();
      describe('suite', () => {
        afterAll(async ({foo}) => {});
        it('works', async ({foo}) => {});
      });
    `,
  });
  expect(result.report.errors[0].error.message).toContain('afterAll hook cannot depend on a test fixture "foo".');
  expect(result.report.errors[0].error.stack).toContain('a.spec.ts:10');
  expect(result.exitCode).toBe(1);
});

it('should throw when hook uses different fixtures set than describe', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'a.spec.ts': `
      const builder1 = baseFolio.extend();
      builder1.foo.init(async ({}, runTest) => {
        await runTest();
      });
      const f1 = builder1.build();

      const builder2 = baseFolio.extend();
      builder2.bar.init(async ({}, runTest) => {
        await runTest();
      });
      const f2 = builder2.build();

      f1.describe('suite', () => {
        f2.afterAll(async ({foo}) => {});
        f1.it('works', async ({foo}) => {});
      });
    `,
  });
  expect(result.report.errors[0].error.message).toContain('Using afterAll hook from a different fixture set.');
  expect(result.report.errors[0].error.stack).toContain('a.spec.ts:17');
  expect(result.exitCode).toBe(1);
});
