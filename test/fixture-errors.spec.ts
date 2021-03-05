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

import { folio, firstStackFrame, stripAscii } from './fixtures';
const { it, expect } = folio;

it('should handle fixture timeout', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'fixtures.ts': `
      async function timeout({}, runTest) {
        await runTest();
        await new Promise(f => setTimeout(f, 100000));
      }
      export const toBeRenamed = { testFixtures: { timeout } };
    `,
    'a.spec.ts': `
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

it('should handle worker fixture timeout', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'fixtures.ts': `
      async function timeout({}, runTest) {
      }
      export const toBeRenamed = { workerFixtures: { timeout } };
    `,
    'a.spec.ts': `
      it('fails', async ({timeout}) => {
      });
    `
  }, { timeout: 500 });
  expect(result.exitCode).toBe(1);
  expect(result.output).toContain('Timeout of 500ms');
});

it('should handle test fixture error', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'fixtures.ts': `
      async function failure({}, runTest) {
        throw new Error('Worker failed');
      }
      export const toBeRenamed = { testFixtures: { failure } };
    `,
    'a.spec.ts': `
      it('fails', async ({failure}) => {
      });
    `
  });
  expect(result.exitCode).toBe(1);
  expect(result.failed).toBe(1);
  expect(result.output).toContain('Worker failed');
});

it('should handle worker tear down fixture error', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'fixtures.ts': `
      async function failure({}, runTest) {
        await runTest();
        throw new Error('Worker failed');
      }
      export const toBeRenamed = { workerFixtures: { failure } };
    `,
    'a.spec.ts': `
      it('pass', async ({failure}) => {
        expect(true).toBe(true);
      });
    `
  });
  expect(result.report.errors[0].error.message).toContain('Worker failed');
  expect(result.exitCode).toBe(1);
});

it('should throw when defining worker fixture twice', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'one.fixtures.ts': `
      async function foo({}, runTest) {
        await runTest();
      }
      export const toBeRenamed = { workerFixtures: { foo } };
    `,
    'two.fixtures.ts': `
      async function foo({}, runTest) {
        await runTest();
      }
      export const toBeRenamed = { workerFixtures: { foo } };
    `,
    'b.spec.ts': `
      it('works', async ({foo}) => {});
    `
  });
  expect(stripAscii(result.output)).toContain(`Fixture "foo" has already been registered. Use a different name for this fixture.`);
  expect(result.exitCode).toBe(1);
});

it('should throw when defining test fixture twice', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'one.fixtures.ts': `
      async function foo({}, runTest) {
        await runTest();
      }
      export const toBeRenamed = { testFixtures: { foo } };
    `,
    'two.fixtures.ts': `
      async function foo({}, runTest) {
        await runTest();
      }
      export const toBeRenamed = { testFixtures: { foo } };
    `,
    'd.spec.ts': `
      it('works', async ({foo}) => {});
    `
  });
  expect(stripAscii(result.output)).toContain(`Fixture "foo" has already been registered. Use a different name for this fixture.`);
  expect(result.exitCode).toBe(1);
});

it('should throw when defining test fixture with the same name as a worker fixture', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'one.fixtures.ts': `
      async function foo({}, runTest) {
        await runTest();
      }
      export const toBeRenamed = { testFixtures: { foo }, workerFixtures: { foo } };
    `,
    'e.spec.ts': `
      it('works', async ({foo}) => {});
    `,
  });
  expect(stripAscii(result.output)).toContain(`Fixture "foo" has already been registered as a { scope: 'worker' } fixture. Use a different name for this test fixture.`);
  expect(result.exitCode).toBe(1);
});

it('should throw when worker fixture depends on a test fixture', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'fixtures.ts': `
      async function foo({}, runTest) {
        await runTest();
      }
      async function bar({foo}, runTest) {
        await runTest();
      }
      export const toBeRenamed = { testFixtures: { foo }, workerFixtures: { bar } };
    `,
    'f.spec.ts': `
      it('works', async ({bar}) => {});
    `,
  });
  expect(stripAscii(result.output)).toContain('Worker fixture "bar" cannot depend on a test fixture "foo".');
  expect(result.exitCode).toBe(1);
});

it('should detect fixture dependency cycle', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'fixtures.ts': `
      async function good2({good1}, runTest) { await runTest(); }
      export const toBeRenamed = { testFixtures: { good2 } };
    `,
    'dir/fixtures.ts': `
      async function good1({}, runTest) { await runTest(); }
      async function foo({bar}, runTest) { await runTest(); }
      async function bar({baz}, runTest) { await runTest(); }
      async function baz({qux}, runTest) { await runTest(); }
      async function qux({foo}, runTest) { await runTest(); }
      export const toBeRenamed = { testFixtures: { foo, bar, good1, baz, qux } };
    `,
    'dir/x.spec.ts': `
      it('works', async ({foo}) => {});
    `,
  });
  expect(stripAscii(result.output)).toContain('Fixtures "foo" -> "bar" -> "baz" -> "qux" -> "foo" form a dependency cycle.');
  expect(result.exitCode).toBe(1);
});

it('should detect fixture dependency cycle across files', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'one.fixtures.ts': `
      async function foo({bar}, runTest) { await runTest(); }
      async function bar({qux}, runTest) { await runTest(); }
      export const toBeRenamed = { testFixtures: { foo, bar } };
    `,
    'two.fixtures.ts': `
      async function qux({foo}, runTest) { await runTest(); }
      export const toBeRenamed = { testFixtures: { qux } };
    `,
    'x.spec.ts': `
      it('works', async ({foo}) => {});
    `,
  });
  expect(stripAscii(result.output)).toContain('Fixtures "foo" -> "bar" -> "qux" -> "foo" form a dependency cycle.');
  expect(result.exitCode).toBe(1);
});

it('should throw when calling runTest twice', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'fixtures.ts': `
      async function foo({}, runTest) {
        await runTest();
        await runTest();
      }
      export const toBeRenamed = { testFixtures: { foo } };
    `,
    'f.spec.ts': `
      it('works', async ({foo}) => {});
    `,
  });
  expect(result.results[0].error.message).toBe('Cannot provide fixture value for the second time');
  expect(result.exitCode).toBe(1);
});

it('should throw when test is called in fixutres file', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'fixtures.js': `
      it(async ({}) => {});
    `,
    'a.test.js': `
      it('test', async ({}) => {
      });
    `,
  });
  expect(stripAscii(result.output)).toContain('Test cannot be defined in a fixture file.');
});
