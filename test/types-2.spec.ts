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

import { test, expect } from './folio-test';

test('basics should work', async ({runTSC}) => {
  const result = await runTSC({
    'a.spec.ts': `
      const { test } = folio;
      test.describe('suite', () => {
        test.beforeEach(async () => {});
        test('my test', async({}, testInfo) => {
          expect(testInfo.title).toBe('my test');
          testInfo.data.foo = 'bar';
          testInfo.annotations[0].type;
        });
      });
    `
  });
  expect(result.exitCode).toBe(0);
});

test('can pass sync functions everywhere', async ({runTSC}) => {
  const result = await runTSC({
    'a.spec.ts': `
      const { test } = folio;
      test.beforeEach(() => {});
      test.afterEach(() => {});
      test.beforeAll(() => {});
      test.afterAll(() => {});
      test('my test', () => {});
    `
  });
  expect(result.exitCode).toBe(0);
});

test('can return anything from hooks', async ({runTSC}) => {
  const result = await runTSC({
    'a.spec.ts': `
      const { test } = folio;
      test.beforeEach(() => '123');
      test.afterEach(() => 123);
      test.beforeAll(() => [123]);
      test.afterAll(() => ({ a: 123 }));
    `
  });
  expect(result.exitCode).toBe(0);
});

test('test.declare should check types', async ({runTSC}) => {
  const result = await runTSC({
    'helper.ts': `
      export const test = folio.test;
      export const test1 = test.declare<{ foo: string }>();
      export const test2 = test1.extend({ beforeEach: ({ foo }) => { return { bar: parseInt(foo) }; } });
      // @ts-expect-error
      export const test3 = test1.extend({ beforeEach: ({ bar }) => { return {}; } });
    `,
    'folio.config.ts': `
      import { test1 } from './helper';
      const configs: folio.Config[] = [];
      configs.push({});
      configs.push({
        define: {
          test: test1,
          env: { beforeEach: () => { return { foo: 12 }; } }
        },
      });

      configs.push({
        define: {
          test: test1,
          // @ts-expect-error
          env: { foo: 'bar' },
        },
      });

      configs.push({
        // @ts-expect-error
        define: { test: {}, env: {} },
      });
      module.exports = configs;
    `,
    'a.spec.ts': `
      import { test, test1, test2, test3 } from './helper';
      // @ts-expect-error
      test('my test', async ({ foo }) => {});
      test1('my test', async ({ foo }) => {});
      // @ts-expect-error
      test1('my test', async ({ foo, bar }) => {});
      test2('my test', async ({ foo, bar }) => {});
      // @ts-expect-error
      test2('my test', async ({ foo, baz }) => {});
    `
  });
  expect(result.exitCode).toBe(0);
});

test('test.extend should infer types from methods', async ({runTSC}) => {
  const result = await runTSC({
    'helper.ts': `
      export const test1 = folio.test.extend({
        beforeAll: ({}, workerInfo) => { return { yes: true }; },
        beforeEach: ({}, testInfo) => { return { foo: 42, bar: 'bar' }; },
        afterEach: ({}, testInfo) => {},
        afterAll: ({}, workerInfo) => {},
      });
      export const test2 = test1.extend({
        beforeEach: ({ foo, yes }) => { return { baz: foo - 5, no: !yes }; },
        afterEach: ({ foo }) => {},
      });
    `,
    'a.spec.ts': `
      import { test1, test2 } from './helper';
      test1.beforeAll(({ yes }) => {
        let x: boolean = yes;
      });
      // @ts-expect-error
      test1.beforeAll(({ no }) => {});

      test1.beforeEach(({ yes, foo }) => {
        let x: boolean = yes;
        let y: number = foo;
      });
      // @ts-expect-error
      test1.beforeEach(({ no }) => {});

      test1('my test', async ({ foo, bar }) => {});
      // @ts-expect-error
      test1('my test', async ({ baz }) => {});
      // @ts-expect-error
      test1('my test', async ({ foo, bar, baz }) => {});

      test2('my test', async ({ foo, bar, baz }) => {});
      test2('my test', async ({ foo, bar, baz, no }) => {
        let x: string = bar;
        let y: number = foo;
        let z: number = baz;
        let w: boolean = no;
      });
      test2('my test', async ({ foo, bar, baz, yes }) => {
        // @ts-expect-error
        let x: number = bar;
        // @ts-expect-error
        let y: string = foo;
        // @ts-expect-error
        let z: string = baz;
        // @ts-expect-error
        let w: number = yes;
      });
      // @ts-expect-error
      test2('my test', async ({ x }) => {});
    `
  });
  expect(result.exitCode).toBe(0);
});
