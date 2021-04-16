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
      test.foo();
    `
  });
  expect(result.exitCode).not.toBe(0);
  expect(result.output).toContain(`Property 'foo' does not exist`);
});

test('runWith should check types', async ({runTSC}) => {
  const result = await runTSC({
    'folio.config.ts': `
      class Env1 {
        async beforeEach(args, testInfo: folio.TestInfo) {
          return { a: '42' };
        }
      }
      class Env2 {
        async beforeEach(args, testInfo: folio.TestInfo) {
          return { b: 42 };
        }
      }
      export const test = folio.newTestType<{ a: string, b: number }>();
      const x: number = '123';  // To match line numbers easier.
      test.runWith(new Env1());  // error
      test.runWith(folio.merge(new Env1(), new Env2()));
      test.runWith(new Env1(), {});  // error
      test.runWith(new Env1(), { timeout: 100 });  // error
      test.runWith(folio.merge(new Env1(), new Env2()), { timeout: 100, tag: ['tag1', 'tag2'] });
      test.runWith({ timeout: 100 });  // error
      test.runWith('alias');  // error
      test.runWith({});  // error
    `,
    'a.spec.ts': `
      import { test } from './folio.config';
      test('my test', async () => {
      });
    `
  });
  expect(result.exitCode).not.toBe(0);
  expect(result.output).toContain(`folio.config.ts(15,13): error TS2322: Type 'string' is not assignable to type 'number'.`);
  expect(result.output).toContain('folio.config.ts(16');
  expect(result.output).not.toContain('folio.config.ts(17');
  expect(result.output).toContain('folio.config.ts(18');
  expect(result.output).toContain('folio.config.ts(19');
  expect(result.output).not.toContain('folio.config.ts(20');
  expect(result.output).toContain('folio.config.ts(21');
  expect(result.output).toContain('folio.config.ts(22');
  expect(result.output).toContain('folio.config.ts(23');
});

test('runWith should allow void env', async ({runTSC}) => {
  const result = await runTSC({
    'folio.config.ts': `
      export const test = folio.newTestType();
      const x: number = '123';  // To match line numbers easier.
      test.runWith();
      test.runWith('alias');  // error
      test.runWith('foo', 'bar');  // error
      test.runWith({ timeout: 100 });  // error
      test.runWith({}, { timeout: 100 });
      test.runWith(undefined, { timeout: 100 });
      test.runWith({ beforeEach: () => {} }, { timeout: 100 });
      test.runWith({ beforeEach: () => { return 42; } }, { timeout: 100 });  // error
    `,
    'a.spec.ts': `
      import { test } from './folio.config';
      test('my test', async () => {
      });
    `
  });
  expect(result.exitCode).not.toBe(0);
  expect(result.output).toContain(`folio.config.ts(5,13): error TS2322: Type 'string' is not assignable to type 'number'.`);
  expect(result.output).not.toContain('folio.config.ts(6');
  expect(result.output).toContain('folio.config.ts(7');
  expect(result.output).toContain('folio.config.ts(8');
  expect(result.output).toContain('folio.config.ts(9');
  expect(result.output).not.toContain('folio.config.ts(10');
  expect(result.output).not.toContain('folio.config.ts(11');
  expect(result.output).not.toContain('folio.config.ts(12');
  expect(result.output).not.toContain('folio.config.ts(13');
});

test('test.extend should check types', async ({runTSC}) => {
  const result = await runTSC({
    'folio.config.ts': `
      export const test = folio.newTestType<{ foo: string }>();
      class FooEnv {
        beforeEach() {
          return { foo: '17' };
        }
      }
      const x: number = '123';  // To match line numbers easier.
      export const test1 = test.extend({ beforeEach: ({ foo }) => { return { bar: parseInt(foo) + 42 }; } });
      test.runWith({});  // error
      test1.runWith({});  // error
      test.runWith(new FooEnv());
      test1.runWith({});  // error
      test1.runWith(new FooEnv());
      export const test2 = test1.extend({ beforeEach: ({ bar }) => { return { baz: bar - 5 }; } });
      test2.runWith({});  // error
      test2.runWith(new FooEnv());
      export const test3 = test.extend({ beforeEach: ({ bar }) => { return { baz: bar - 5 }; } });  // error
    `,
    'a.spec.ts': `
      import { test, test1, test2 } from './folio.config';
      const x: number = '123';  // To match line numbers easier.
      test('my test', async ({ foo }) => {});
      test('my test', async ({ bar }) => {});  // error
      test1('my test', async ({ foo, bar }) => {});
      test2('my test', async ({ foo, bar, baz }) => {});
      test2('my test', async ({ x }) => {}); // error
    `
  });
  expect(result.exitCode).not.toBe(0);

  expect(result.output).toContain(`folio.config.ts(10,13): error TS2322: Type 'string' is not assignable to type 'number'.`);
  expect(result.output).not.toContain('folio.config.ts(11');
  expect(result.output).toContain('folio.config.ts(12');
  expect(result.output).toContain('folio.config.ts(13');
  expect(result.output).not.toContain('folio.config.ts(14');
  expect(result.output).toContain('folio.config.ts(15');
  expect(result.output).not.toContain('folio.config.ts(16');
  expect(result.output).not.toContain('folio.config.ts(17');
  expect(result.output).toContain('folio.config.ts(18');
  expect(result.output).not.toContain('folio.config.ts(19');
  expect(result.output).toContain('folio.config.ts(20');

  expect(result.output).toContain(`a.spec.ts(6,13): error TS2322: Type 'string' is not assignable to type 'number'.`);
  expect(result.output).not.toContain('a.spec.ts(7');
  expect(result.output).toContain('a.spec.ts(8');
  expect(result.output).not.toContain('a.spec.ts(9');
  expect(result.output).not.toContain('a.spec.ts(10');
  expect(result.output).toContain('a.spec.ts(11');
});

test.describe('expect', () => {
  test('should work with default expect prototype functions', async ({runTSC}) => {
    const result = await runTSC({
      'folio.config.ts': `
        export const test = folio.newTestType();
      `,
      'a.spec.ts': `
        import { test } from './folio.config';
        const expected = [1, 2, 3, 4, 5, 6];
        test.expect([4, 1, 6, 7, 3, 5, 2, 5, 4, 6]).toEqual(
          expect.arrayContaining(expected),
        );
      `
    });
    expect(result.exitCode).toBe(0);
  });

  test('should work with default expect matchers', async ({runTSC}) => {
    const result = await runTSC({
      'folio.config.ts': `
        export const test = folio.newTestType();
      `,
      'a.spec.ts': `
        import { test } from './folio.config';
        test.expect(42).toBe(42);
      `
    });
    expect(result.exitCode).toBe(0);
  });

  test('should work with jest-community/jest-extended', async ({runTSC}) => {
    const result = await runTSC({
      'global.d.ts': `
        // Extracted example from their typings.
        // Reference: https://github.com/jest-community/jest-extended/blob/master/types/index.d.ts
        declare namespace jest {
          interface Matchers<R> {
            toBeEmpty(): R;
          }
        }
      `,
      'a.spec.ts': `
        test.expect('').toBeEmpty();
        test.expect('hello').not.toBeEmpty();
        test.expect([]).toBeEmpty();
        test.expect(['hello']).not.toBeEmpty();
        test.expect({}).toBeEmpty();
        test.expect({ hello: 'world' }).not.toBeEmpty();
      `
    });
    expect(result.exitCode).toBe(0);
  });

  test('should work with custom folio namespace', async ({runTSC}) => {
    const result = await runTSC({
      'global.d.ts': `
        // Extracted example from their typings.
        // Reference: https://github.com/jest-community/jest-extended/blob/master/types/index.d.ts
        declare namespace folio {
          interface Matchers<R> {
            toBeEmpty(): R;
          }
        }
      `,
      'a.spec.ts': `
        test.expect.extend({
          toBeWithinRange(received: number, floor: number, ceiling: number) {
            const pass = received >= floor && received <= ceiling;
            if (pass) {
              return {
                message: () => 'abc',
                pass: true,
              };
            } else {
              return {
                message: () => 'abc',
                pass: false,
              };
            }
          },
        });

        test.expect('').toBeEmpty();
        test.expect('hello').not.toBeEmpty();
        test.expect([]).toBeEmpty();
        test.expect(['hello']).not.toBeEmpty();
        test.expect({}).toBeEmpty();
        test.expect({ hello: 'world' }).not.toBeEmpty();
      `
    });
    expect(result.exitCode).toBe(0);
  });
});
