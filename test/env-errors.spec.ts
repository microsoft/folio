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

import { test, expect, stripAscii } from './config';

test('should handle teardownTest timeout', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'folio.config.ts': `
      class MyEnv {
        async teardownTest() {
          await new Promise(f => setTimeout(f, 100000));
        }
      }
      export const test = folio.test;
      test.runWith(new MyEnv());
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

test('should handle teardownWorker timeout', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'folio.config.ts': `
      class MyEnv {
        async teardownWorker() {
          await new Promise(f => setTimeout(f, 100000));
        }
      }
      export const test = folio.test;
      test.runWith(new MyEnv());
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

test('should handle env setupTest error', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'folio.config.ts': `
      class MyEnv {
        async setupTest() {
          throw new Error('Worker failed');
        }
      }
      export const test = folio.test;
      test.runWith(new MyEnv());
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

test('should handle teardownWorker error', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'folio.config.ts': `
      class MyEnv {
        async teardownWorker() {
          throw new Error('Worker failed');
        }
      }
      export const test = folio.test;
      test.runWith(new MyEnv());
    `,
    'a.spec.ts': `
      import { test } from './folio.config';
      test('pass', async ({}) => {
        expect(true).toBe(true);
      });
    `
  });
  expect(result.report.errors[0].message).toContain('Worker failed');
  expect(result.exitCode).toBe(1);
});

test('should throw when test() is called in config file', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'folio.config.ts': `
      export const test = folio.test;
      test('hey', () => {});
    `,
    'a.test.ts': `
      import { test } from './folio.config';
      test('test', async ({}) => {
      });
    `,
  });
  expect(stripAscii(result.output)).toContain('Test can only be defined in a test file.');
});

test('should run teardownWorker from mulitple envs when one throws', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'folio.config.ts': `
      class MyEnv1 {
        async teardownWorker() {
          throw new Error('Bad env');
        }
      }
      class MyEnv2 {
        async teardownWorker() {
          console.log('env2-teardownWorker');
        }
      }
      export const test = folio.test.extend(new MyEnv1()).extend(new MyEnv2());
      test.runWith();
    `,
    'a.test.ts': `
      import { test } from './folio.config';
      test('test', async ({}) => {
      });
    `,
  });
  expect(result.output).toContain('Bad env');
  expect(result.output).toContain('env2-teardownWorker');
});

test('can only call runWith in config file', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'folio.config.ts': `
      export const test = folio.test;
      test.runWith();
    `,
    'a.test.ts': `
      import { test } from './folio.config';
      test.runWith();
      test('test', async ({}) => {
      });
    `,
  });
  expect(result.exitCode).toBe(1);
  expect(result.output).toContain('runWith() can only be called in a configuration file');
});
