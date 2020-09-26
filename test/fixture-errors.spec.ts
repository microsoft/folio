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
      const { it, defineTestFixture } = baseFixtures;

      defineTestFixture('timeout', async ({}, runTest) => {
        await runTest();
        await new Promise(f => setTimeout(f, 100000));
      });

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
  expect(result.failed).toBe(1);
  expect(result.timedOut).toBe(1);
});

it('should handle worker fixture timeout', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'a.spec.ts': `
      const { it, defineWorkerFixture } = baseFixtures;

      defineWorkerFixture('timeout', async ({}, runTest) => {
      });

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
      const { it, defineWorkerFixture } = baseFixtures;

      defineWorkerFixture('failure', async ({}, runTest) => {
        throw new Error('Worker failed');
      });

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
      const { it, defineWorkerFixture } = baseFixtures;

      defineWorkerFixture('failure', async ({}, runTest) => {
        await runTest();
        throw new Error('Worker failed');
      });

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
      const { it, overrideWorkerFixture } = baseFixtures;
      overrideWorkerFixture('foo', async ({}, runTest) => {
        await runTest();
      });
      it('works', async ({foo}) => {});
    `
  });
  expect(result.report.errors[0].error.message).toContain('Fixture "foo" has not been registered yet. Use defineWorkerFixture instead.');
  expect(result.exitCode).toBe(1);
});

it('should throw when defining worker fixture twice', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'b.spec.ts': `
      const { it, defineWorkerFixture } = baseFixtures;
      defineWorkerFixture('foo', async ({}, runTest) => {
        await runTest();
      });
      defineWorkerFixture('foo', async ({}, runTest) => {
        await runTest();
      });
      it('works', async ({foo}) => {});
    `
  });
  expect(result.report.errors[0].error.message).toContain('Fixture "foo" has already been registered. Use overrideWorkerFixture to override it in a specific test file.');
  expect(result.exitCode).toBe(1);
});

it('should throw when overriding non-defined test fixture', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'c.spec.ts': `
      const { it, overrideTestFixture } = baseFixtures;
      overrideTestFixture('foo', async ({}, runTest) => {
        await runTest();
      });
      it('works', async ({foo}) => {});
    `
  });
  expect(result.report.errors[0].error.message).toContain('Fixture "foo" has not been registered yet. Use defineTestFixture instead.');
  expect(result.exitCode).toBe(1);
});

it('should throw when defining test fixture twice', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'd.spec.ts': `
      const { it, defineTestFixture } = baseFixtures;
      defineTestFixture('foo', async ({}, runTest) => {
        await runTest();
      });
      defineTestFixture('foo', async ({}, runTest) => {
        await runTest();
      });
      it('works', async ({foo}) => {});
    `
  });
  expect(result.report.errors[0].error.message).toContain('Fixture "foo" has already been registered. Use overrideTestFixture to override it in a specific test file.');
  expect(result.exitCode).toBe(1);
});

it('should throw when defining test fixture with the same name as a worker fixture', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'e.spec.ts': `
      const { it, defineTestFixture, defineWorkerFixture } = baseFixtures;
      defineWorkerFixture('foo', async ({}, runTest) => {
        await runTest();
      });
      defineTestFixture('foo', async ({}, runTest) => {
        await runTest();
      });
      it('works', async ({foo}) => {});
    `,
  });
  expect(result.report.errors[0].error.message).toContain('Fixture "foo" has already been registered as a worker fixture. Use a different name for this test fixture.');
  expect(result.exitCode).toBe(1);
});

it('should throw when defining worker fixture with the same name as a test fixture', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'e.spec.ts': `
      const { it, defineTestFixture, defineWorkerFixture } = baseFixtures;
      defineTestFixture('foo', async ({}, runTest) => {
        await runTest();
      });
      defineWorkerFixture('foo', async ({}, runTest) => {
        await runTest();
      });
      it('works', async ({foo}) => {});
    `,
  });
  expect(result.report.errors[0].error.message).toContain('Fixture "foo" has already been registered as a test fixture. Use a different name for this worker fixture.');
  expect(result.exitCode).toBe(1);
});

it('should throw when overriding worker fixture as a test fixture', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'f.spec.ts': `
      const { it, overrideTestFixture, defineWorkerFixture } = baseFixtures;
      defineWorkerFixture('foo', async ({}, runTest) => {
        await runTest();
      });
      overrideTestFixture('foo', async ({}, runTest) => {
        await runTest();
      });
      it('works', async ({foo}) => {});
    `,
  });
  expect(result.report.errors[0].error.message).toContain('Fixture "foo" is a worker fixture. Use overrideWorkerFixture instead.');
  expect(result.exitCode).toBe(1);
});

it('should throw when overriding test fixture as a worker fixture', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'f.spec.ts': `
      const { it, overrideWorkerFixture, defineTestFixture } = baseFixtures;
      defineTestFixture('foo', async ({}, runTest) => {
        await runTest();
      });
      overrideWorkerFixture('foo', async ({}, runTest) => {
        await runTest();
      });
      it('works', async ({foo}) => {});
    `,
  });
  expect(result.report.errors[0].error.message).toContain('Fixture "foo" is a test fixture. Use overrideTestFixture instead.');
  expect(result.report.errors[0].error.stack).toContain('f.spec.ts:8');
  expect(result.exitCode).toBe(1);
});

it('should define and override the same fixture in two files', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'a.spec.ts': `
      const { it, defineWorkerFixture, overrideWorkerFixture } = baseFixtures;
      defineWorkerFixture('foo', async ({}, runTest) => {
        await runTest();
      });
      overrideWorkerFixture('foo', async ({}, runTest) => {
        await runTest();
      });
      it('works', async ({foo}) => {});
    `,
    'b.spec.ts': `
      const { it, defineWorkerFixture, overrideWorkerFixture } = baseFixtures;
      defineWorkerFixture('foo', async ({}, runTest) => {
        await runTest();
      });
      overrideWorkerFixture('foo', async ({}, runTest) => {
        await runTest();
      });
      it('works', async ({foo}) => {});
    `,
  });
  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(2);
});

it('should detect fixture dependency cycle', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'x.spec.ts': `
      const { it, defineTestFixture } = baseFixtures;
      defineTestFixture('good1', async ({}, runTest) => {
        await runTest();
      });
      defineTestFixture('foo', async ({bar}, runTest) => {
        await runTest();
      });
      defineTestFixture('bar', async ({baz}, runTest) => {
        await runTest();
      });
      defineTestFixture('good2', async ({good1}, runTest) => {
        await runTest();
      });
      defineTestFixture('baz', async ({qux}, runTest) => {
        await runTest();
      });
      defineTestFixture('qux', async ({foo}, runTest) => {
        await runTest();
      });
      it('works', async ({foo}) => {});
    `,
  });
  expect(result.report.errors[0].error.message).toContain('Fixtures "foo" -> "bar" -> "baz" -> "qux" -> "foo" form a dependency cycle.');
  expect(result.exitCode).toBe(1);
});
