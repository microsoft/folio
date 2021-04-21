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
        async setupWorker() {
          global.logs.push('setupWorker' + this.suffix);
        }
        async teardownWorker() {
          global.logs.push('teardownWorker' + this.suffix);
          if (this.suffix.includes('base'))
            console.log(global.logs.join('\\n'));
        }
        async setupTest() {
          global.logs.push('setupTest' + this.suffix);
          return { foo: 'bar' };
        }
        async teardownTest() {
          global.logs.push('teardownTest' + this.suffix);
        }
      }
      export const base = folio.test;
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
  });
  expect(passed).toBe(4);
  expect(output).toContain([
    'setupWorker-base1',
    'setupWorker-e1',
    'setupTest-base1',
    'setupTest-e1',
    'test1',
    'teardownTest-e1',
    'teardownTest-base1',
    'teardownWorker-e1',
    'teardownWorker-base1',
  ].join('\n'));
  expect(output).toContain([
    'setupWorker-base1',
    'setupWorker-e2',
    'setupTest-base1',
    'setupTest-e2',
    'test2',
    'teardownTest-e2',
    'teardownTest-base1',
    'teardownWorker-e2',
    'teardownWorker-base1',
  ].join('\n'));
  expect(output).toContain([
    'setupWorker-base2',
    'setupWorker-e1',
    'setupTest-base2',
    'setupTest-e1',
    'test1',
    'teardownTest-e1',
    'teardownTest-base2',
    'teardownWorker-e1',
    'teardownWorker-base2',
  ].join('\n'));
  expect(output).toContain([
    'setupWorker-base2',
    'setupWorker-e2',
    'setupTest-base2',
    'setupTest-e2',
    'test2',
    'teardownTest-e2',
    'teardownTest-base2',
    'teardownWorker-e2',
    'teardownWorker-base2',
  ].join('\n'));
});

test('test.extend should work with plain object syntax', async ({ runInlineTest }) => {
  const { output, passed } = await runInlineTest({
    'folio.config.ts': `
      export const test = folio.test.extend({
        async setupTest() {
          this.foo = 'bar';
          return { foo: this.foo };
        },
        teardownTest({}, testInfo) {
          console.log('teardownTest=' + this.foo + ';' + testInfo.title);
        },
      });
      test.runWith();
    `,
    'a.test.js': `
      const { test } = require('./folio.config');
      test('test1', async ({foo}) => {
        expect(foo).toBe('bar');
      });
    `,
  });
  expect(passed).toBe(1);
  expect(output).toContain('teardownTest=bar;test1');
});

test('test.declare should fork', async ({ runInlineTest }) => {
  const { failed, passed, skipped } = await runInlineTest({
    'folio.config.ts': `
      export const test1 = folio.test.declare();
      test1.runWith();
      export const test2 = folio.test.declare();
      test2.runWith({ timeout: 100 });
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

test('test.extend should chain worker and test args', async ({ runInlineTest }) => {
  const { output, passed } = await runInlineTest({
    'folio.config.ts': `
      global.logs = [];
      export class Env1 {
        async setupWorker() {
          global.logs.push('setupWorker1');
          return { w1: 'w1' };
        }
        async teardownWorker({ w1 }) {
          global.logs.push('teardownWorker1-w1=' + w1);
          console.log(global.logs.join('\\n'));
        }
        async setupTest() {
          global.logs.push('setupTest1');
          return { t1: 't1' };
        }
        async teardownTest({ t1 }) {
          global.logs.push('teardownTest1-t1=' + t1);
        }
      }
      export class Env2 {
        async setupWorker({ w1 }) {
          global.logs.push('setupWorker2-w1=' + w1);
          return { w2: 'w2' };
        }
        async teardownWorker({ w1, w2 }) {
          global.logs.push('teardownWorker2-w1=' + w1 + ',w2=' + w2);
        }
        async setupTest({ t1 }) {
          global.logs.push('setupTest2-t1=' + t1);
          return { t2: 't2' };
        }
        async teardownTest({ t1, t2 }) {
          global.logs.push('teardownTest2-t1=' + t1 + ',t2=' + t2);
        }
      }
      export class Env3 {
        async setupWorker({ w1, w2 }) {
          global.logs.push('setupWorker3-w1=' + w1 + ',w2=' + w2);
          return { w3: 'w3' };
        }
        async teardownWorker({ w1, w2, w3 }) {
          global.logs.push('teardownWorker3-w1=' + w1 + ',w2=' + w2 + ',w3=' + w3);
        }
        async setupTest({ t1, t2}) {
          global.logs.push('setupTest3-t1=' + t1 + ',t2=' + t2);
          return { t3: 't3' };
        }
        async teardownTest({ t1, t2, t3 }) {
          global.logs.push('teardownTest3-t1=' + t1 + ',t2=' + t2 + ',t3=' + t3);
        }
      }
      export const test = folio.test.declare().extend(new Env2()).extend(new Env3());
      test.runWith(new Env1());
    `,
    'a.test.js': `
      const { test } = require('./folio.config');
      test('should work', async ({t1, t2, t3}) => {
        global.logs.push('test-t1=' + t1 + ',t2=' + t2 + ',t3=' + t3);
      });
    `,
  });
  expect(passed).toBe(1);
  expect(output).toContain([
    'setupWorker1',
    'setupWorker2-w1=w1',
    'setupWorker3-w1=w1,w2=w2',
    'setupTest1',
    'setupTest2-t1=t1',
    'setupTest3-t1=t1,t2=t2',
    'test-t1=t1,t2=t2,t3=t3',
    'teardownTest3-t1=t1,t2=t2,t3=t3',
    'teardownTest2-t1=t1,t2=t2',
    'teardownTest1-t1=t1',
    'teardownWorker3-w1=w1,w2=w2,w3=w3',
    'teardownWorker2-w1=w1,w2=w2',
    'teardownWorker1-w1=w1',
  ].join('\n'));
});

test('env.options should work', async ({ runInlineTest }) => {
  const { exitCode, passed } = await runInlineTest({
    'folio.config.ts': `
      export class Env1 {
        async setupWorker(options) {
          return { bar: options.foo + '2' };
        }
      }
      export class Env2 {
        async setupWorker(options) {
          return { baz: options.foo + options.bar };
        }
      }
      export const test = folio.test.declare().extend(new Env1()).extend(new Env2());
      test.runWith({ options: { foo: 'foo' } });
    `,
    'a.test.js': `
      const { test } = require('./folio.config');
      let value;
      test.beforeAll(({ foo, bar, baz }) => {
        value = 'foo=' + foo + ';bar=' + bar + ';baz=' + baz;
      });
      test('should work', async () => {
        expect(value).toBe('foo=undefined;bar=foo2;baz=foofoo2');
      });
    `,
  });
  expect(passed).toBe(1);
  expect(exitCode).toBe(0);
});
