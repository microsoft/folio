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
        async beforeEach(testInfo: folio.TestInfo) {
          return { a: '42' };
        }
      }
      class Env2 {
        async beforeEach(testInfo: folio.TestInfo) {
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
