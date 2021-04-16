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

test('basics should work', async ({runTSC}) => {
  const result = await runTSC({
    'a.spec.ts': `
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
    'folio.config.ts': `
      export const test = folio.newTestType();
      const x: number = '123';  // To match line numbers easier.
      export const test1 = test.declare<{ foo: string }>();
      export const test2 = test1.extend({ beforeEach: ({ foo }) => { return { bar: parseInt(foo) }; } });
      test.runWith({});
      test1.runWith({});  // error
      test1.runWith({ beforeEach: () => { return { foo: 'foo' }; }});
      test1.runWith({ beforeEach: () => { return { foo: 42 }; }});  // error
      test2.runWith({});  // error
      test2.runWith({ beforeEach: () => { return { foo: 'foo' }; }});
      export const test3 = test1.declare<{ baz: number }>();
      test3.runWith({ beforeEach: () => { return { foo: 'foo' }; }});  // error
      test3.runWith({ beforeEach: ({ baz }) => { return { foo: 'foo', baz: 42 }; }});  // error
      test3.runWith({ beforeEach: () => { return { foo: 'foo', baz: 42 }; }});
    `,
    'a.spec.ts': `
      import { test, test1, test2, test3 } from './folio.config';
      const x: number = '123';  // To match line numbers easier.
      test('my test', async ({ foo }) => {});  // error
      test1('my test', async ({ foo }) => {});
      test1('my test', async ({ foo, bar }) => {});  // error
      test2('my test', async ({ foo, bar }) => {});
      test3('my test', async ({ foo, baz }) => {});
      test3('my test', async ({ foo, bar }) => {});  // error
      test2('my test', async ({ foo, baz }) => {});  // error
    `
  });
  expect(result.exitCode).not.toBe(0);

  expect(result.output).toContain(`folio.config.ts(5,13): error TS2322: Type 'string' is not assignable to type 'number'.`);
  expect(result.output).not.toContain('folio.config.ts(6');
  expect(result.output).not.toContain('folio.config.ts(7');
  expect(result.output).not.toContain('folio.config.ts(8');
  expect(result.output).toContain('folio.config.ts(9');
  expect(result.output).not.toContain('folio.config.ts(10');
  expect(result.output).toContain('folio.config.ts(11');
  expect(result.output).toContain('folio.config.ts(12');
  expect(result.output).not.toContain('folio.config.ts(13');
  expect(result.output).not.toContain('folio.config.ts(14');
  expect(result.output).toContain('folio.config.ts(15');
  expect(result.output).toContain('folio.config.ts(16');
  expect(result.output).not.toContain('folio.config.ts(17');

  expect(result.output).toContain(`a.spec.ts(6,13): error TS2322: Type 'string' is not assignable to type 'number'.`);
  expect(result.output).toContain('a.spec.ts(7');
  expect(result.output).not.toContain('a.spec.ts(8');
  expect(result.output).toContain('a.spec.ts(9');
  expect(result.output).not.toContain('a.spec.ts(10');
  expect(result.output).not.toContain('a.spec.ts(11');
  expect(result.output).toContain('a.spec.ts(12');
  expect(result.output).toContain('a.spec.ts(13');
});
