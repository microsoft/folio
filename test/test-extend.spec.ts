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

test('test.extend should work', async ({ runInlineTest }) => {
  const { output, passed } = await runInlineTest({
    'folio.config.ts': `
      global.logs = [];
      export class MyEnv {
        constructor(suffix) {
          this.suffix = suffix;
        }
        async beforeAll() {
          global.logs.push('beforeAll' + this.suffix);
        }
        async afterAll() {
          global.logs.push('afterAll' + this.suffix);
          if (this.suffix.includes('base'))
            console.log(global.logs.join('\\n'));
        }
        async beforeEach() {
          global.logs.push('beforeEach' + this.suffix);
          return { foo: 'bar' };
        }
        async afterEach() {
          global.logs.push('afterEach' + this.suffix);
        }
      }
      export const base = folio.newTestType();
      base.runWith(new MyEnv('-base1'));
      base.runWith(new MyEnv('-base2'));
    `,
    'helper.ts': `
      import { base, MyEnv } from './folio.config';
      export const test1 = base.extend(new MyEnv('-e1'));
      export const test2 = base.extend(new MyEnv('-e2'));
    `,
    'a.test.js': `
      const { test1, test2 } = require('./helper');
      test1('should work', async ({foo}) => {
        global.logs.push('test1');
        expect(foo).toBe('bar');
      });
      test2('should work', async ({foo}) => {
        global.logs.push('test2');
        expect(foo).toBe('bar');
      });
    `,
    'b.test.js': `
      const { test1 } = require('./helper');
      test1('should work', async ({foo}) => {
        global.logs.push('test3');
        expect(foo).toBe('bar');
      });
    `,
  });
  expect(passed).toBe(6);
  expect(output).toContain([
    'beforeAll-base1',
    'beforeAll-e1',
    'beforeEach-base1',
    'beforeEach-e1',
    'test1',
    'afterEach-e1',
    'afterEach-base1',
    'afterAll-e1',
    'afterAll-base1',
  ].join('\n'));
  expect(output).toContain([
    'beforeAll-base1',
    'beforeAll-e2',
    'beforeEach-base1',
    'beforeEach-e2',
    'test2',
    'afterEach-e2',
    'afterEach-base1',
    'afterAll-e2',
    'afterAll-base1',
  ].join('\n'));
  expect(output).toContain([
    'beforeAll-base2',
    'beforeAll-e1',
    'beforeEach-base2',
    'beforeEach-e1',
    'test1',
    'afterEach-e1',
    'afterEach-base2',
    'afterAll-e1',
    'afterAll-base2',
  ].join('\n'));
  expect(output).toContain([
    'beforeAll-base2',
    'beforeAll-e2',
    'beforeEach-base2',
    'beforeEach-e2',
    'test2',
    'afterEach-e2',
    'afterEach-base2',
    'afterAll-e2',
    'afterAll-base2',
  ].join('\n'));
  expect(output).toContain([
    'beforeAll-base1',
    'beforeAll-e1',
    'beforeEach-base1',
    'beforeEach-e1',
    'test3',
    'afterEach-e1',
    'afterEach-base1',
    'afterAll-e1',
    'afterAll-base1',
  ].join('\n'));
  expect(output).toContain([
    'beforeAll-base2',
    'beforeAll-e1',
    'beforeEach-base2',
    'beforeEach-e1',
    'test3',
    'afterEach-e1',
    'afterEach-base2',
    'afterAll-e1',
    'afterAll-base2',
  ].join('\n'));
});

test('test.extend should work with plain object syntax', async ({ runInlineTest }) => {
  const { output, passed } = await runInlineTest({
    'folio.config.ts': `
      export const test = folio.newTestType().extend({
        async beforeEach() {
          this.foo = 'bar';
          return { foo: this.foo };
        },
        afterEach(testInfo) {
          console.log('afterEach=' + this.foo + ';' + testInfo.title);
        },
      });
      test.runWith({});
    `,
    'a.test.js': `
      const { test } = require('./folio.config');
      test('test1', async ({foo}) => {
        expect(foo).toBe('bar');
      });
    `,
  });
  expect(passed).toBe(1);
  expect(output).toContain('afterEach=bar;test1');
});

test('test.declare should for', async ({ runInlineTest }) => {
  const { failed, passed, skipped } = await runInlineTest({
    'folio.config.ts': `
      const test = folio.newTestType();
      export const test1 = test.declare();
      test1.runWith({});
      export const test2 = test.declare();
      test2.runWith({}, { timeout: 100 });
    `,
    'a.test.js': `
      const { test1, test2 } = require('./folio.config');
      test1('test1', async ({}) => {
        await new Promise(f => setTimeout(f, 1000));
      });
      test2('test2', async ({}) => {
        await new Promise(f => setTimeout(f, 1000));
      });
    `,
  });
  expect(passed).toBe(1);
  expect(failed).toBe(1);
  expect(skipped).toBe(0);
});
