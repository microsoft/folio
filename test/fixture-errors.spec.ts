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

it('should handle fixture timeout', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'a.spec.ts': `
      const builder = baseFolio.extend();
      builder.defineTestFixture('timeout', async ({}, runTest) => {
        await runTest();
        await new Promise(f => setTimeout(f, 100000));
      });
      const { it } = builder.build();

      it('fixture timeout', async ({timeout}) => {
        expect(1).toBe(1);
      });

      it('failing fixture timeout', async ({timeout}) => {
        expect(1).toBe(2);
      });
    `
  }, { timeout: 500 });
  expect(result.exitCode).toBe(1);
  expect(result.output).toContain('Timeout of 500ms');
  expect(result.failed).toBe(2);
});

it('should handle worker fixture timeout', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'a.spec.ts': `
      const builder = baseFolio.extend();
      builder.defineWorkerFixture('timeout', async ({}, runTest) => {
      });
      const { it } = builder.build();

      it('fails', async ({timeout}) => {
      });
    `
  }, { timeout: 500 });
  expect(result.exitCode).toBe(1);
  expect(result.output).toContain('Timeout of 500ms');
});

it('should handle worker fixture error', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'a.spec.ts': `
      const builder = baseFolio.extend();
      builder.defineTestFixture('failure', async ({}, runTest) => {
        throw new Error('Worker failed');
      });
      const { it } = builder.build();

      it('fails', async ({failure}) => {
      });
    `
  });
  expect(result.exitCode).toBe(1);
  expect(result.failed).toBe(1);
  expect(result.output).toContain('Worker failed');
});

it('should handle worker tear down fixture error', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'a.spec.ts': `
      const builder = baseFolio.extend();
      builder.defineWorkerFixture('failure', async ({}, runTest) => {
        await runTest();
        throw new Error('Worker failed');
      });
      const { it } = builder.build();

      it('pass', async ({failure}) => {
        expect(true).toBe(true);
      });
    `
  });
  expect(result.report.errors[0].error.message).toContain('Worker failed');
  expect(result.exitCode).toBe(1);
});

it('should throw when overriding non-defined worker fixture', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'a.spec.ts': `
      const builder = baseFolio.extend();
      builder.overrideWorkerFixture('foo', async ({}, runTest) => {
        await runTest();
      });
      const { it } = builder.build();
      it('works', async ({foo}) => {});
    `
  });
  expect(result.report.errors[0].error.message).toContain('Fixture "foo" has not been registered yet. Use defineWorkerFixtures instead.');
  expect(result.exitCode).toBe(1);
});

it('should throw when defining worker fixture twice', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'b.spec.ts': `
      const builder = baseFolio.extend();
      builder.defineWorkerFixture('foo', async ({}, runTest) => {
        await runTest();
      });
      builder.defineWorkerFixture('foo', async ({}, runTest) => {
        await runTest();
      });
      const { it } = builder.build();
      it('works', async ({foo}) => {});
    `
  });
  expect(result.report.errors[0].error.message).toContain('Fixture "foo" has already been registered. Use overrideWorkerFixtures to override it in a specific test file.');
  expect(result.exitCode).toBe(1);
});

it('should throw when overriding non-defined test fixture', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'c.spec.ts': `
      const builder = baseFolio.extend();
      builder.overrideTestFixture('foo', async ({}, runTest) => {
        await runTest();
      });
      const { it } = builder.build();
      it('works', async ({foo}) => {});
    `
  });
  expect(result.report.errors[0].error.message).toContain('Fixture "foo" has not been registered yet. Use defineTestFixtures instead.');
  expect(result.exitCode).toBe(1);
});

it('should throw when defining test fixture twice', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'd.spec.ts': `
      const builder = baseFolio.extend();
      builder.defineTestFixture('foo', async ({}, runTest) => {
        await runTest();
      });
      builder.defineTestFixture('foo', async ({}, runTest) => {
        await runTest();
      });
      const { it } = builder.build();
      it('works', async ({foo}) => {});
    `
  });
  expect(result.report.errors[0].error.message).toContain('Fixture "foo" has already been registered. Use overrideTestFixtures to override it in a specific test file.');
  expect(result.exitCode).toBe(1);
});

it('should throw when defining test fixture with the same name as a worker fixture', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'e.spec.ts': `
      const builder = baseFolio.extend();
      builder.defineWorkerFixture('foo', async ({}, runTest) => {
        await runTest();
      });
      builder.defineTestFixture('foo', async ({}, runTest) => {
        await runTest();
      });
      const { it } = builder.build();
      it('works', async ({foo}) => {});
    `,
  });
  expect(result.report.errors[0].error.message).toContain('Fixture "foo" has already been registered as a worker fixture. Use a different name for this test fixture.');
  expect(result.exitCode).toBe(1);
});

it('should throw when defining worker fixture with the same name as a test fixture', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'e.spec.ts': `
      const builder = baseFolio.extend();
      builder.defineTestFixture('foo', async ({}, runTest) => {
        await runTest();
      });
      builder.defineWorkerFixture('foo', async ({}, runTest) => {
        await runTest();
      });
      const { it } = builder.build();
      it('works', async ({foo}) => {});
    `,
  });
  expect(result.report.errors[0].error.message).toContain('Fixture "foo" has already been registered as a test fixture. Use a different name for this worker fixture.');
  expect(result.exitCode).toBe(1);
});

it('should throw when overriding worker fixture as a test fixture', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'f.spec.ts': `
      const builder = baseFolio.extend();
      builder.defineWorkerFixture('foo', async ({}, runTest) => {
        await runTest();
      });
      builder.overrideTestFixture('foo', async ({}, runTest) => {
        await runTest();
      });
      const { it } = builder.build();
      it('works', async ({foo}) => {});
    `,
  });
  expect(result.report.errors[0].error.message).toContain('Fixture "foo" is a worker fixture. Use overrideWorkerFixtures instead.');
  expect(result.exitCode).toBe(1);
});

it('should throw when overriding test fixture as a worker fixture', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'f.spec.ts': `
      const builder = baseFolio.extend();
      builder.defineTestFixture('foo', async ({}, runTest) => {
        await runTest();
      });
      builder.overrideWorkerFixture('foo', async ({}, runTest) => {
        await runTest();
      });
      const { it } = builder.build();
      it('works', async ({foo}) => {});
    `,
  });
  expect(result.report.errors[0].error.message).toContain('Fixture "foo" is a test fixture. Use overrideTestFixtures instead.');
  expect(result.report.errors[0].error.stack).toContain('f.spec.ts:8');
  expect(result.exitCode).toBe(1);
});

it('should throw when worker fixture depends on a test fixture', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'f.spec.ts': `
      const builder = baseFolio.extend();
      builder.defineTestFixture('foo', async ({}, runTest) => {
        await runTest();
      });
      builder.defineWorkerFixture('bar', async ({foo}, runTest) => {
        await runTest();
      });
      const { it } = builder.build();
      it('works', async ({bar}) => {});
    `,
  });
  expect(result.report.errors[0].error.message).toContain('Worker fixture "bar" cannot depend on a test fixture "foo".');
  expect(result.exitCode).toBe(1);
});

it('should define and override the same fixture in two files', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'a.spec.ts': `
      const builder = baseFolio.extend();
      builder.defineWorkerFixture('foo', async ({}, runTest) => {
        await runTest();
      });
      builder.overrideWorkerFixture('foo', async ({}, runTest) => {
        await runTest();
      });
      const { it } = builder.build();
      it('works', async ({foo}) => {});
    `,
    'b.spec.ts': `
      const builder = baseFolio.extend();
      builder.defineWorkerFixture('foo', async ({}, runTest) => {
        await runTest();
      });
      builder.overrideWorkerFixture('foo', async ({}, runTest) => {
        await runTest();
      });
      const { it } = builder.build();
      it('works', async ({foo}) => {});
    `,
  });
  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(2);
});

it('should detect fixture dependency cycle', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'x.spec.ts': `
      const builder = baseFolio.extend();
      builder.defineTestFixture('good1', ({}, runTest) => runTest());
      builder.defineTestFixture('foo', ({bar}, runTest) => runTest());
      builder.defineTestFixture('bar', ({baz}, runTest) => runTest());
      builder.defineTestFixture('good2', ({good1}, runTest) => runTest());
      builder.defineTestFixture('baz', ({qux}, runTest) => runTest());
      builder.defineTestFixture('qux', ({foo}, runTest) => runTest());
      const { it } = builder.build();
      it('works', async ({foo}) => {});
    `,
  });
  expect(result.report.errors[0].error.message).toContain('Fixtures "foo" -> "bar" -> "baz" -> "qux" -> "foo" form a dependency cycle.');
  expect(result.exitCode).toBe(1);
});

it('should throw when fixture is redefined in union', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'a.test.js': `
      const builder1 = baseFolio.extend();
      builder1.defineTestFixture('foo', ({}, runTest) => runTest(123));
      const fixtures1 = builder1.build();
      const builder2 = baseFolio.extend();
      builder2.defineTestFixture('foo', ({}, runTest) => runTest(456));
      const fixtures2 = builder2.build();
      const { it } = fixtures1.union(fixtures2);
      it('test', async ({foo, bar}) => {
        expect(foo).toBe(123);
        expect(bar).toBe(456);
      });
    `,
  });
  expect(result.report.errors[0].error.message).toContain('Fixture "foo" is defined in both fixture sets.');
  expect(result.report.errors[0].error.stack).toContain('a.test.js:10');
});

it('should throw when mixing different fixture objects', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'a.test.js': `
      const builder1 = baseFolio.extend();
      builder1.defineTestFixture('foo', ({}, runTest) => runTest(123));
      const fixtures1 = builder1.build();
      const builder2 = baseFolio.extend();
      builder2.defineTestFixture('bar', ({}, runTest) => runTest(456));
      const fixtures2 = builder2.build();
      fixtures1.describe('suite', () => {
        fixtures1.it('test 1', async ({foo}) => {
          expect(foo).toBe(123);
        });
        fixtures2.it('test 2', async ({bar}) => {
          expect(bar).toBe(456);
        });
      });
    `,
  });
  expect(result.report.errors[0].error.message).toContain('Mixing different fixture sets in the same suite.');
  expect(result.report.errors[0].error.stack).toContain('a.test.js:14');
});

it('should not reuse fixtures from one file in another one', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'a.spec.ts': `
      const builder = baseFolio.extend();
      builder.defineTestFixture('foo', ({}, runTest) => runTest());
      const { it } = builder.build();
      it('test1', async ({}) => {});
    `,
    'b.spec.ts': `
      const { it } = baseFolio;
      it('test1', async ({}) => {});
      it('test2', async ({foo}) => {});
    `,
  });
  expect(result.report.errors[0].error.message).toBe('Test has unknown parameter "foo".');
  expect(result.report.errors[0].error.stack).toContain('b.spec.ts:6');
  expect(result.results.length).toBe(1);
});

it('should detect a cycle in the union', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'a.test.js': `
      const baseBuilder = baseFolio.extend();
      baseBuilder.defineTestFixture('foo', ({}, runTest) => runTest('foo'));
      baseBuilder.defineTestFixture('bar', ({}, runTest) => runTest('bar'));
      const base = baseBuilder.build();

      const builder1 = base.extend();
      builder1.overrideTestFixture('foo', ({bar}, runTest) => runTest('foo'));
      const fixtures1 = builder1.build();

      const builder2 = base.extend();
      builder2.overrideTestFixture('bar', ({foo}, runTest) => runTest('foo'));
      const fixtures2 = builder2.build();

      const { it } = fixtures1.union(fixtures2);
      it('test', async ({foo, bar}) => {
        expect(foo).toBe('foo');
        expect(bar).toBe('bar');
      });
    `,
  });
  expect(result.report.errors[0].error.message).toContain('Fixtures "foo" -> "bar" -> "foo" form a dependency cycle.');
  expect(result.report.errors[0].error.stack).toContain('a.test.js:17');
});
