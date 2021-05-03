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

test('runTests should check types of options', async ({runTSC}) => {
  const result = await runTSC({
    'folio.config.ts': `
      export const test = folio.test.extend({
        hasBeforeAllOptions(options: { foo: string, bar: number }) {
          return false;
        },
        async beforeEach({}, testInfo: folio.TestInfo) {
          return { a: '42', b: 42 };
        }
      });
      class Env2 {
        beforeAll() {
          return { foo: '42' };
        }
      }
      folio.runTests({ options: { foo: '42', bar: 42 } });
      folio.runTests<typeof test>({ options: { foo: '42', bar: 42 } });
      folio.runTests({ options: { foo: '42', bar: 42 }, timeout: 100 });
      // @ts-expect-error
      folio.runTests({ options: { foo: '42', bar: 42 } }, {});
      // @ts-expect-error
      folio.runTests<typeof test>({ options: { foo: '42' } });
      // @ts-expect-error
      folio.runTests<typeof test>({ options: { bar: '42' } });
      // @ts-expect-error
      folio.runTests<typeof test>({ options: { bar: 42 } });
      // @ts-expect-error
      folio.runTests<typeof test>(new Env2());
      // @ts-expect-error
      folio.runTests<typeof test>({ options: { foo: 42, bar: 42 } });
      // @ts-expect-error
      folio.runTests<typeof test>({ beforeAll: async () => { return {}; } });
      // TODO: next line should not compile.
      folio.runTests<typeof test>({ timeout: 100 });
      // @ts-expect-error
      folio.runTests<typeof test>('alias');
      // TODO: next line should not compile.
      folio.runTests<typeof test>({});
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

test('runTests should allow void/empty options', async ({runTSC}) => {
  const result = await runTSC({
    'folio.config.ts': `
      export const test = folio.test;
      folio.runTests<typeof test>({});
      folio.runTests<typeof test>({ timeout: 100 });
      folio.runTests<typeof test>();
      folio.runTests<typeof test>({ options: { foo: 42 }});
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
      const declared = folio.test.declare<{ foo: string }>();
      export const test = declared.test;
      class FooEnv {
        beforeEach() {
          return { foo: '17' };
        }
      }
      class BarEnv {
        beforeEach() {
          return { foo: 17 };
        }
      }
      export const test1 = test.extend({ beforeEach: ({ foo }) => { return { bar: parseInt(foo) + 42 }; } });
      export const test2 = test1.extend({ beforeEach: ({ bar }) => { return { baz: bar - 5 }; } });
      // @ts-expect-error
      export const test3 = test.extend({ beforeEach: ({ bar }) => { return { baz: bar - 5 }; } });

      folio.runTests({
        defines: [ declared.define(new FooEnv()) ]
      });
      folio.runTests({
        // @ts-expect-error
        defines: [ declared.define(new BarEnv()) ]
      });
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
