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

import { folio, stripAscii } from './fixtures';
const { it, expect } = folio;

it('should handle env afterEach timeout', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'folio.config.ts': `
      class MyEnv {
        async afterEach() {
          await new Promise(f => setTimeout(f, 100000));
        }
      }
      export const test = folio.newTestType();
      export const suite = test.runWith(new MyEnv());
    `,
    'a.spec.ts': `
      import { test } from './folio.config';
      test('env timeout', async ({}) => {
        expect(1).toBe(1);
      });

      test('failing env timeout', async ({}) => {
        expect(1).toBe(2);
      });
    `
  }, { timeout: 500 });
  expect(result.exitCode).toBe(1);
  expect(result.output).toContain('Timeout of 500ms');
  expect(result.failed).toBe(2);
});

it('should handle env afterAll timeout', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'folio.config.ts': `
      class MyEnv {
        async afterAll() {
          await new Promise(f => setTimeout(f, 100000));
        }
      }
      export const test = folio.newTestType();
      export const suite = test.runWith(new MyEnv());
    `,
    'a.spec.ts': `
      import { test } from './folio.config';
      test('fails', async ({}) => {
      });
    `
  }, { timeout: 500 });
  expect(result.exitCode).toBe(1);
  expect(result.output).toContain('Timeout of 500ms');
});

it('should handle env beforeEach error', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'folio.config.ts': `
      class MyEnv {
        async beforeEach() {
          throw new Error('Worker failed');
        }
      }
      export const test = folio.newTestType();
      export const suite = test.runWith(new MyEnv());
    `,
    'a.spec.ts': `
      import { test } from './folio.config';
      test('fails', async ({}) => {
      });
    `
  });
  expect(result.exitCode).toBe(1);
  expect(result.failed).toBe(1);
  expect(result.output).toContain('Worker failed');
});

it('should handle env afterAll error', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'folio.config.ts': `
      class MyEnv {
        async afterAll() {
          throw new Error('Worker failed');
        }
      }
      export const test = folio.newTestType();
      export const suite = test.runWith(new MyEnv());
    `,
    'a.spec.ts': `
      import { test } from './folio.config';
      test('pass', async ({}) => {
        expect(true).toBe(true);
      });
    `
  });
  expect(result.report.errors[0].error.message).toContain('Worker failed');
  expect(result.exitCode).toBe(1);
});

it('should throw when test() is called in config file', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'folio.config.ts': `
      export const test = folio.newTestType();
      test('hey', () => {});
    `,
    'a.test.js': `
      import { test } from './folio.config';
      test('test', async ({}) => {
      });
    `,
  });
  expect(stripAscii(result.output)).toContain('Test can only be defined in a test file.');
});
