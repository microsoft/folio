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

import { test, expect } from './config';

test('sanity', async ({runTSC}) => {
  const result = await runTSC({
    'a.spec.ts': `
      // @ts-expect-error
      test.foo();
    `
  });
  expect(result.exitCode).toBe(0);
});

test('runWith should check types of options', async ({runTSC}) => {
  const result = await runTSC({
    'folio.config.ts': `
      export const test = folio.test.extend({
        optionsType(): { foo: string, bar: number } {
          return {} as any;
        },
        async beforeEach({}, testInfo: folio.TestInfo) {
          return { a: '42', b: 42 };
        }
      });
      class Env1 {
        beforeAll() {
          return { foo: '42', bar: 42 };
        }
      }
      class Env2 {
        beforeAll() {
          return { foo: '42' };
        }
      }
      test.runWith({ options: { foo: '42', bar: 42 } });
      test.runWith({ options: { foo: '42', bar: 42 }, timeout: 100 });
      test.runWith(new Env1());
      test.runWith(new Env1(), { timeout: 100 });
      test.runWith(new Env1(), {});
      // @ts-expect-error
      test.runWith({ options: { foo: '42', bar: 42 } }, {});
      // @ts-expect-error
      test.runWith({ options: { foo: '42' } });
      // @ts-expect-error
      test.runWith({ options: { bar: '42' } });
      // @ts-expect-error
      test.runWith({ options: { bar: 42 } });
      // @ts-expect-error
      test.runWith(new Env2());
      // @ts-expect-error
      test.runWith({ options: { foo: 42, bar: 42 } });
      // @ts-expect-error
      test.runWith({ beforeAll: async () => { return {}; } });
      // @ts-expect-error
      test.runWith(new Env2(), { timeout: 100 });
      // TODO: next line should not compile.
      test.runWith({ timeout: 100 });
      // @ts-expect-error
      test.runWith('alias');
      // TODO: next line should not compile.
      test.runWith({});
    `,
    'a.spec.ts': `
      import { test } from './folio.config';
      test('my test', async ({ a, b }) => {
        b += parseInt(a);
      });
    `
  });
  expect(result.exitCode).toBe(0);
});

test('runWith should allow void env', async ({runTSC}) => {
  const result = await runTSC({
    'folio.config.ts': `
      export const test = folio.test;
      test.runWith({});
      test.runWith({ timeout: 100 });
      test.runWith({ timeout: 100 });
      test.runWith({ beforeEach: () => {} });
      test.runWith({ beforeEach: () => { return 42; } });
    `,
    'a.spec.ts': `
      import { test } from './folio.config';
      test('my test', async () => {
      });
    `
  });
  expect(result.exitCode).toBe(0);
});

test('test.extend should check types', async ({runTSC}) => {
  const result = await runTSC({
    'folio.config.ts': `
      export const test = folio.test.declare<{ foo: string }>();
      class FooEnv {
        beforeEach() {
          return { foo: '17' };
        }
      }
      export const test1 = test.extend({ beforeEach: ({ foo }) => { return { bar: parseInt(foo) + 42 }; } });
      test.runWith(new FooEnv());
      test1.runWith(new FooEnv());
      export const test2 = test1.extend({ beforeEach: ({ bar }) => { return { baz: bar - 5 }; } });
      test2.runWith(new FooEnv());
      // @ts-expect-error
      export const test3 = test.extend({ beforeEach: ({ bar }) => { return { baz: bar - 5 }; } });
    `,
    'a.spec.ts': `
      import { test, test1, test2 } from './folio.config';
      test('my test', async ({ foo }) => {});
      // @ts-expect-error
      test('my test', async ({ bar }) => {});
      test1('my test', async ({ foo, bar }) => {});
      test2('my test', async ({ foo, bar, baz }) => {});
      // @ts-expect-error
      test2('my test', async ({ x }) => {});
    `
  });
  expect(result.exitCode).toBe(0);
});
