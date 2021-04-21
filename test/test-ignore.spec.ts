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

import { test, expect } from './config';

const tests = {
  'a.test.ts': `
    test('pass', ({}) => {});
  `,
  'b.test.ts': `
    test('pass', ({}) => {});
  `,
  'c.test.ts': `
    test('pass', ({}) => {});
  `
};

test('should run all three tests', async ({ runInlineTest }) => {
  const result = await runInlineTest(tests);
  expect(result.passed).toBe(3);
  expect(result.exitCode).toBe(0);
});

test('should ignore a test', async ({ runInlineTest }) => {
  const result = await runInlineTest(tests, { 'test-ignore': 'b.test.ts' });
  expect(result.passed).toBe(2);
  expect(result.exitCode).toBe(0);
});

test('should ignore a folder', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'a.test.ts': `
      test('pass', ({}) => {});
    `,
    'folder/a.test.ts': `
      test('pass', ({}) => {});
    `,
    'folder/b.test.ts': `
      test('pass', ({}) => {});
    `,
    'folder/c.test.ts': `
      test('pass', ({}) => {});
    `
  }, { 'test-ignore': 'folder/**' });
  expect(result.passed).toBe(1);
  expect(result.exitCode).toBe(0);
});

test('should ignore a node_modules', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'a.test.ts': `
      test('pass', ({}) => {});
    `,
    'node_modules/a.test.ts': `
      test('pass', ({}) => {});
    `,
    'node_modules/b.test.ts': `
      test('pass', ({}) => {});
    `,
    'folder/c.test.ts': `
      test('pass', ({}) => {});
    `
  });
  expect(result.passed).toBe(2);
  expect(result.exitCode).toBe(0);
});

test('should filter tests', async ({ runInlineTest }) => {
  const result = await runInlineTest(tests, { 'test-ignore': 'c.test.*' });
  expect(result.passed).toBe(2);
  expect(result.exitCode).toBe(0);
});

test('should use a different test match', async ({ runInlineTest }) => {
  const result = await runInlineTest(tests, { 'test-match': '[a|b].test.ts' });
  expect(result.passed).toBe(2);
  expect(result.exitCode).toBe(0);
});

test('should use an array for testMatch', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'folio.config.ts': `
      folio.setConfig({ testMatch: ['b.test.ts', /^a.*TS$/i] });
      export const test = folio.test;
      test.runWith();
    `,
    'a.test.ts': `
      import { test } from './folio.config';
      test('pass', ({}) => {});
    `,
    'b.test.ts': `
      import { test } from './folio.config';
      test('pass', ({}) => {});
    `,
    'c.test.ts': `
      import { test } from './folio.config';
      test('pass', ({}) => {});
    `
  });
  expect(result.passed).toBe(2);
  expect(result.report.suites.map(s => s.file).sort()).toEqual(['a.test.ts', 'b.test.ts']);
  expect(result.exitCode).toBe(0);
});
