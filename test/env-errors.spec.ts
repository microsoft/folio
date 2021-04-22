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

test('should handle env afterEach timeout', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'folio.config.ts': `
      class MyEnv {
        async afterEach() {
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

test('should handle env afterAll timeout', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'folio.config.ts': `
      class MyEnv {
        async afterAll() {
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

test('should handle env beforeEach error', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'folio.config.ts': `
      class MyEnv {
        async beforeEach() {
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

test('should handle env afterAll error', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'folio.config.ts': `
      class MyEnv {
        async afterAll() {
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

test('should run afterAll from mulitple envs when one throws', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'folio.config.ts': `
      class MyEnv1 {
        async afterAll() {
          throw new Error('Bad env');
        }
      }
      class MyEnv2 {
        async afterAll() {
          console.log('env2-afterAll');
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
  expect(result.output).toContain('env2-afterAll');
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

test('should not run afterAll when did not run beforeAll', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'folio.config.ts': `
      class MyEnv1 {
        async beforeAll() {
          console.log('beforeAll-1');
          await new Promise(() => {});
        }
        async afterAll() {
          console.log('afterAll-1');
        }
      }
      class MyEnv2 {
        async beforeAll() {
          console.log('beforeAll-2');
        }
        async afterAll() {
          console.log('afterAll-2');
        }
      }
      export const test = folio.test.extend(new MyEnv1()).extend(new MyEnv2());
      test.runWith();
      folio.setConfig({ timeout: 1000 });
    `,
    'a.test.ts': `
      import { test } from './folio.config';
      test('test', async ({}) => {
      });
    `,
  });
  expect(result.exitCode).toBe(1);
  expect(result.output).toContain('beforeAll-1');
  expect(result.output).not.toContain('afterAll-1');
  expect(result.output).not.toContain('beforeAll-2');
  expect(result.output).not.toContain('afterAll-2');
});

test('should not run afterEach when did not run beforeEach', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'folio.config.ts': `
      class MyEnv1 {
        async beforeEach() {
          console.log('beforeEach-1');
          await new Promise(() => {});
        }
        async afterEach() {
          console.log('afterEach-1');
        }
      }
      class MyEnv2 {
        async beforeEach() {
          console.log('beforeEach-2');
        }
        async afterEach() {
          console.log('afterEach-2');
        }
      }
      export const test = folio.test.extend(new MyEnv1()).extend(new MyEnv2());
      test.runWith();
      folio.setConfig({ timeout: 1000 });
    `,
    'a.test.ts': `
      import { test } from './folio.config';
      test('test', async ({}) => {
      });
    `,
  });
  expect(result.exitCode).toBe(1);
  expect(result.output).toContain('beforeEach-1');
  expect(result.output).not.toContain('afterEach-1');
  expect(result.output).not.toContain('beforeEach-2');
  expect(result.output).not.toContain('afterEach-2');
});
