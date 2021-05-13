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

test('test.extend should work', async ({ runInlineTest }) => {
  const { output, passed } = await runInlineTest({
    'helper.ts': `
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
      export const base = folio.test.declare();
    `,
    'folio.config.ts': `
      import { base, MyEnv } from './helper';
      module.exports = { projects: [
        { define: { test: base, env: new MyEnv('-base1') } },
        { define: { test: base, env: new MyEnv('-base2') } },
      ] };
    `,
    'a.test.ts': `
      import { base, MyEnv } from './helper';
      const test1 = base.extend(new MyEnv('-e1'));
      const test2 = base.extend(new MyEnv('-e2'));
      test1('should work', async ({foo}) => {
        global.logs.push('test1');
        expect(foo).toBe('bar');
      });
      test2('should work', async ({foo}) => {
        global.logs.push('test2');
        expect(foo).toBe('bar');
      });
    `,
  });
  expect(passed).toBe(4);
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
});

test('test.extend should work with plain object syntax', async ({ runInlineTest }) => {
  const { output, passed } = await runInlineTest({
    'helper.ts': `
      export const test = folio.test.extend({
        async beforeEach() {
          this.foo = 'bar';
          return { foo: this.foo };
        },
        afterEach({}, testInfo) {
          console.log('afterEach=' + this.foo + ';' + testInfo.title);
        },
      });
    `,
    'a.test.js': `
      const { test } = require('./helper');
      test('test1', async ({foo}) => {
        expect(foo).toBe('bar');
      });
    `,
  });
  expect(passed).toBe(1);
  expect(output).toContain('afterEach=bar;test1');
});

test('test.extend should chain worker and test args', async ({ runInlineTest }) => {
  const { output, passed } = await runInlineTest({
    'helper.ts': `
      global.logs = [];
      export class Env1 {
        async beforeAll() {
          global.logs.push('beforeAll1');
          return { w1: 'w1' };
        }
        async afterAll({ w1 }) {
          global.logs.push('afterAll1-w1=' + w1);
          console.log(global.logs.join('\\n'));
        }
        async beforeEach({ w1 }) {
          global.logs.push('beforeEach1-w1=' + w1);
          return { t1: 't1' };
        }
        async afterEach({ t1, w1 }) {
          global.logs.push('afterEach1-w1=' + w1 + ',t1=' + t1);
        }
      }
      export class Env2 {
        async beforeAll({ w1 }) {
          global.logs.push('beforeAll2-w1=' + w1);
          return { w2: 'w2' };
        }
        async afterAll({ w1, w2 }) {
          global.logs.push('afterAll2-w1=' + w1 + ',w2=' + w2);
        }
        async beforeEach({ t1, w2 }) {
          global.logs.push('beforeEach2-t1=' + t1 + ',w2=' + w2);
          return { t2: 't2' };
        }
        async afterEach({ t1, t2, w2 }) {
          global.logs.push('afterEach2-t1=' + t1 + ',t2=' + t2 + ',w2=' + w2);
        }
      }
      export class Env3 {
        async beforeAll({ w1, w2 }) {
          global.logs.push('beforeAll3-w1=' + w1 + ',w2=' + w2);
          return { w3: 'w3' };
        }
        async afterAll({ w1, w2, w3 }) {
          global.logs.push('afterAll3-w1=' + w1 + ',w2=' + w2 + ',w3=' + w3);
        }
        async beforeEach({ t1, t2}) {
          global.logs.push('beforeEach3-t1=' + t1 + ',t2=' + t2);
          return { t3: 't3' };
        }
        async afterEach({ t1, t2, t3 }) {
          global.logs.push('afterEach3-t1=' + t1 + ',t2=' + t2 + ',t3=' + t3);
        }
      }
      export const declared = folio.test.extend(new Env1()).declare();
      export const test = declared.extend(new Env3());
    `,
    'folio.config.ts': `
      import { declared, Env2 } from './helper';
      module.exports = {
        define: { test: declared, env: new Env2() },
      };
    `,
    'a.test.js': `
      const { test } = require('./helper');
      test('should work', async ({t1, t2, t3, w1}) => {
        global.logs.push('test-t1=' + t1 + ',t2=' + t2 + ',t3=' + t3 + ',w1=' + w1);
      });
    `,
  });
  expect(passed).toBe(1);
  expect(output).toContain([
    'beforeAll1',
    'beforeAll2-w1=w1',
    'beforeAll3-w1=w1,w2=w2',
    'beforeEach1-w1=w1',
    'beforeEach2-t1=t1,w2=w2',
    'beforeEach3-t1=t1,t2=t2',
    'test-t1=t1,t2=t2,t3=t3,w1=w1',
    'afterEach3-t1=t1,t2=t2,t3=undefined',
    'afterEach2-t1=t1,t2=undefined,w2=w2',
    'afterEach1-w1=w1,t1=undefined',
    'afterAll3-w1=w1,w2=w2,w3=undefined',
    'afterAll2-w1=w1,w2=undefined',
    'afterAll1-w1=undefined',
  ].join('\n'));
});

test('env.options should work', async ({ runInlineTest }) => {
  const { exitCode, passed } = await runInlineTest({
    'helper.ts': `
      export class Env1 {
        async beforeAll(options) {
          return { bar: options.foo + '2' };
        }
      }
      export class Env2 {
        async beforeAll(options) {
          return { baz: options.foo + options.bar };
        }
      }
      export const test = folio.test.extend(new Env1()).extend(new Env2());
    `,
    'folio.config.ts': `
      module.exports = { options: { foo: 'foo' } };
    `,
    'a.test.js': `
      const { test } = require('./helper');
      let value;
      test.beforeAll(({ foo, bar, baz }) => {
        value = 'foo=' + foo + ';bar=' + bar + ';baz=' + baz;
      });
      test('should work', async () => {
        expect(value).toBe('foo=foo;bar=foo2;baz=foofoo2');
      });
    `,
  });
  expect(passed).toBe(1);
  expect(exitCode).toBe(0);
});
