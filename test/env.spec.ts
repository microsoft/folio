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

test('env should work', async ({ runInlineTest }) => {
  const { results, output } = await runInlineTest({
    'a.test.js': `
      global.logs = [];
      class MyEnv {
        async beforeAll() {
          global.logs.push('beforeAll');
          return { x: 1 };
        }
        async afterAll() {
          global.logs.push('afterAll');
          console.log(global.logs.join('\\n'));
        }
        async beforeEach() {
          global.logs.push('beforeEach');
          return { foo: 'bar' };
        }
        async afterEach() {
          global.logs.push('afterEach');
        }
      }
      const test = folio.test.extend(new MyEnv());

      test('should work', async ({foo}) => {
        global.logs.push('test1');
        expect(foo).toBe('bar');
      });
      test('should work', async ({foo}) => {
        global.logs.push('test2');
        expect(foo).toBe('bar');
      });
    `,
  });
  expect(results[0].status).toBe('passed');
  expect(output).toContain('beforeAll\nbeforeEach\ntest1\nafterEach\nbeforeEach\ntest2\nafterEach\nafterAll');
});

const multipleEnvs = {
  'helper.js': `
    global.logs = [];
    class MyEnv {
      constructor(suffix) {
        this.suffix = suffix;
      }
      async beforeAll() {
        global.logs.push('beforeAll' + this.suffix);
      }
      async afterAll() {
        global.logs.push('afterAll' + this.suffix);
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
    exports.MyEnv = MyEnv;
    const fooDeclare = folio.test.declare();
    exports.fooTest = fooDeclare.test;
    exports.fooDefine = fooDeclare.define;
    const barDeclare = folio.test.declare();
    exports.barTest = barDeclare.test;
    exports.barDefine = barDeclare.define;
  `,
  'folio.config.ts': `
    import { barDefine, fooDefine, MyEnv } from './helper';
    module.exports = { projects: [
      {
        tag: 'suite1',
        defines: [
          fooDefine(new MyEnv('-env1')),
          barDefine(new MyEnv('-env2')),
        ],
      },
      {
        tag: 'suite2',
        defines: [
          fooDefine(new MyEnv('-env3')),
          barDefine(new MyEnv('-env4')),
        ],
      },
    ] };
  `,
  'a.test.js': `
    const {fooTest, barTest} = require('./helper');
    fooTest('should work', async ({foo}) => {
      global.logs.push('fooTest');
      expect(foo).toBe('bar');
    });
    barTest('should work', async ({foo}) => {
      global.logs.push('barTest');
      expect(foo).toBe('bar');
    });
  `,
};

test('multiple envs and suites should work', async ({ runInlineTest }) => {
  const { passed, failed, output } = await runInlineTest(multipleEnvs);
  expect(passed).toBe(4);
  expect(failed).toBe(0);
  expect(output).toContain('beforeAll-env1\nbeforeEach-env1\nfooTest\nafterEach-env1\nafterAll-env1');
  expect(output).toContain('beforeAll-env2\nbeforeEach-env2\nbarTest\nafterEach-env2\nafterAll-env2');
  expect(output).toContain('beforeAll-env3\nbeforeEach-env3\nfooTest\nafterEach-env3\nafterAll-env3');
  expect(output).toContain('beforeAll-env4\nbeforeEach-env4\nbarTest\nafterEach-env4\nafterAll-env4');
});

test('should filter by tag', async ({ runInlineTest }) => {
  const { passed, failed, output } = await runInlineTest(multipleEnvs, { tag: ['suite2'] });
  expect(passed).toBe(2);
  expect(failed).toBe(0);
  expect(output).toContain('beforeAll-env3\nbeforeEach-env3\nfooTest\nafterEach-env3\nafterAll-env3');
  expect(output).toContain('beforeAll-env4\nbeforeEach-env4\nbarTest\nafterEach-env4\nafterAll-env4');
});

test('should teardown env after timeout', async ({ runInlineTest }, testInfo) => {
  const file = testInfo.outputPath('log.txt');
  require('fs').writeFileSync(file, '', 'utf8');
  const result = await runInlineTest({
    'a.spec.ts': `
      class MyEnv {
        async afterAll() {
          require('fs').appendFileSync(process.env.TEST_FILE, 'afterAll\\n', 'utf8');
        }
        async afterEach() {
          require('fs').appendFileSync(process.env.TEST_FILE, 'afterEach\\n', 'utf8');
        }
      }
      const test = folio.test.extend(new MyEnv());

      test('test', async ({}) => {
        await new Promise(() => {});
      });
    `,
  }, { timeout: 1000 }, { TEST_FILE: file });
  expect(result.results[0].status).toBe('timedOut');
  const content = require('fs').readFileSync(file, 'utf8');
  expect(content).toContain('afterEach');
  expect(content).toContain('afterAll');
});

test('should initialize env once across files', async ({ runInlineTest }) => {
  const { passed, failed, output } = await runInlineTest({
    'helper.js': `
      global.logs = [];
      class MyEnv {
        async beforeAll() {
          global.logs.push('beforeAll');
        }
        async afterAll() {
          global.logs.push('afterAll');
          console.log(global.logs.join('\\n'));
        }
      }
      exports.test = folio.test.extend(new MyEnv());
    `,
    'a.test.js': `
      const {test} = require('./helper');
      test('should work', async ({}) => {
        global.logs.push('test1');
      });
    `,
    'b.test.js': `
      const {test} = require('./helper');
      test('should work', async ({}) => {
        global.logs.push('test2');
      });
    `,
  }, { workers: 1 });
  expect(passed).toBe(2);
  expect(failed).toBe(0);
  expect(output).toContain('beforeAll\ntest1\ntest2\nafterAll');
});

test('should run sync env methods and hooks', async ({ runInlineTest }) => {
  const { passed } = await runInlineTest({
    'helper.ts': `
      class Env {
        beforeAll() {
          this.counter = 0;
        }
        beforeEach() {
          return { counter: this.counter };
        }
        afterEach() {
          this.counter++;
        }
        afterAll() {
        }
      }
      export const test = folio.test.extend(new Env());
    `,
    'a.test.js': `
      const { test } = require('./helper');
      let init = false;
      test.beforeAll(() => {
        init = true;
      });
      test.afterAll(() => {
        init = false;
      });
      test('test1', async ({counter}) => {
        expect(counter).toBe(0);
        expect(init).toBe(true);
      });
      test('test2', async ({counter}) => {
        expect(counter).toBe(1);
        expect(init).toBe(true);
      });
    `,
  });
  expect(passed).toBe(2);
});

test('should not create a new worker for environment with beforeEach only', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'a.test.ts': `
      const { test } = folio;
      test('base test', async ({}, testInfo) => {
        expect(testInfo.workerIndex).toBe(0);
      });

      const test2 = test.extend({
        beforeEach() {
          console.log('beforeEach-a');
        }
      });
      test2('a test', async ({}, testInfo) => {
        expect(testInfo.workerIndex).toBe(0);
      });
    `,
    'b.test.ts': `
      const { test } = folio;
      const test2 = test.extend({
        beforeEach() {
          console.log('beforeEach-b');
        }
      });
      const test3 = test2.extend({
        beforeEach() {
          console.log('beforeEach-c');
        }
      });
      test3('b test', async ({}, testInfo) => {
        expect(testInfo.workerIndex).toBe(0);
      });
    `,
  }, { workers: 1 });
  expect(result.output).toContain('beforeEach-a');
  expect(result.output).toContain('beforeEach-b');
  expect(result.output).toContain('beforeEach-c');
  expect(result.passed).toBe(3);
});

test('should create a new worker for environment with afterAll', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'a.test.ts': `
      const { test } = folio;
      test('base test', async ({}, testInfo) => {
        expect(testInfo.workerIndex).toBe(0);
      });

      const test2 = test.extend({
        beforeAll() {
          console.log('beforeAll-a');
        }
      });
      test2('a test', async ({}, testInfo) => {
        expect(testInfo.workerIndex).toBe(1);
      });
    `,
    'b.test.ts': `
      const { test } = folio;
      const test2 = test.extend({
        beforeEach() {
          console.log('beforeEach-b');
        }
      });
      test2('b test', async ({}, testInfo) => {
        expect(testInfo.workerIndex).toBe(0);
      });
    `,
  }, { workers: 1 });
  expect(result.output).toContain('beforeAll-a');
  expect(result.output).toContain('beforeEach-b');
  expect(result.passed).toBe(3);
});

test('should run tests in order', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'a.test.ts': `
      const { test } = folio;
      test('test1', async ({}, testInfo) => {
        expect(testInfo.workerIndex).toBe(0);
        console.log('\\n%%test1');
      });

      const child = test.extend({
        beforeEach() {
          console.log('\\n%%beforeEach');
        },
        afterEach() {
          console.log('\\n%%afterEach');
        }
      });
      child('test2', async ({}, testInfo) => {
        expect(testInfo.workerIndex).toBe(0);
        console.log('\\n%%test2');
      });

      test('test3', async ({}, testInfo) => {
        expect(testInfo.workerIndex).toBe(0);
        console.log('\\n%%test3');
      });
    `,
  }, { workers: 1 });
  expect(result.passed).toBe(3);
  expect(result.output.split('\n').filter(line => line.startsWith('%%'))).toEqual([
    '%%test1',
    '%%beforeEach',
    '%%test2',
    '%%afterEach',
    '%%test3',
  ]);
});

test('should not create a new worker for extend+declare+extend', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'helper.ts': `
      const declared = folio.test.extend({
        beforeAll() {},
      }).declare();
      export const test = declared.test.extend({
        beforeEach() {},
      });
      export const define = declared.define;
    `,
    'folio.config.ts': `
      import { define } from './helper';
      module.exports = {
        defines: [
          define({ beforeAll() {} })
        ],
      };
    `,
    'a.test.ts': `
      import { test } from './helper';
      test('testa', async ({}, testInfo) => {
        expect(testInfo.workerIndex).toBe(0);
        console.log('testa');
      });
    `,
    'b.test.ts': `
      import { test } from './helper';
      test('testb', async ({}, testInfo) => {
        expect(testInfo.workerIndex).toBe(0);
        console.log('testb');
      });
    `,
  }, { workers: 1 });
  expect(result.passed).toBe(2);
  expect(result.output).toContain('testa');
  expect(result.output).toContain('testb');
});
