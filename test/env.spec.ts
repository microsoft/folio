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
    'folio.config.ts': `
      global.logs = [];
      class MyEnv {
        async setupWorker() {
          global.logs.push('setupWorker');
          return { x: 1 };
        }
        async teardownWorker({ x }) {
          if (x !== 1)
            throw new Error('expected 1');
          global.logs.push('teardownWorker');
          console.log(global.logs.join('\\n'));
        }
        async setupTest() {
          global.logs.push('setupTest');
          return { foo: 'bar' };
        }
        async teardownTest({ foo }) {
          if (foo !== 'bar')
            throw new Error('expected bar');
          global.logs.push('teardownTest');
        }
      }
      export const test = folio.test;
      test.runWith(new MyEnv());
    `,
    'a.test.js': `
      const { test } = require('./folio.config');
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
  expect(output).toContain('setupWorker\nsetupTest\ntest1\nteardownTest\nsetupTest\ntest2\nteardownTest\nteardownWorker');
});

const multipleEnvs = {
  'folio.config.js': `
    global.logs = [];
    class MyEnv {
      constructor(suffix) {
        this.suffix = suffix;
      }
      async setupWorker() {
        global.logs.push('setupWorker' + this.suffix);
      }
      async teardownWorker() {
        global.logs.push('teardownWorker' + this.suffix);
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
    exports.fooTest = folio.test.declare();
    exports.barTest = folio.test.declare();
    exports.fooTest.runWith(new MyEnv('-env1'), { tag: 'suite1' });
    exports.fooTest.runWith(new MyEnv('-env2'), { tag: 'suite2' });
    exports.barTest.runWith(new MyEnv('-env3'), { tag: 'suite3' });
  `,
  'a.test.js': `
    const {fooTest, barTest} = require('./folio.config');
    fooTest('should work', async ({foo}) => {
      global.logs.push('fooTest');
      expect(foo).toBe('bar');
    });
    barTest('should work', async ({foo}) => {
      global.logs.push('barTest1');
      expect(foo).toBe('bar');
    });
    barTest('should work', async ({foo}) => {
      global.logs.push('barTest2');
      expect(foo).toBe('bar');
    });
  `,
};

test('multiple envs and suites should work', async ({ runInlineTest }) => {
  const { passed, failed, output } = await runInlineTest(multipleEnvs);
  expect(passed).toBe(4);
  expect(failed).toBe(0);
  expect(output).toContain('setupWorker-env1\nsetupTest-env1\nfooTest\nteardownTest-env1\nteardownWorker-env1');
  expect(output).toContain('setupWorker-env2\nsetupTest-env2\nfooTest\nteardownTest-env2\nteardownWorker-env2');
  expect(output).toContain('setupWorker-env3\nsetupTest-env3\nbarTest1\nteardownTest-env3\nsetupTest-env3\nbarTest2\nteardownTest-env3\nteardownWorker-env3');
});

test('should filter by tag', async ({ runInlineTest }) => {
  const { passed, failed, output } = await runInlineTest(multipleEnvs, { tag: ['suite2', 'suite1'] });
  expect(passed).toBe(2);
  expect(failed).toBe(0);
  expect(output).toContain('setupWorker-env1\nsetupTest-env1\nfooTest\nteardownTest-env1\nteardownWorker-env1');
  expect(output).toContain('setupWorker-env2\nsetupTest-env2\nfooTest\nteardownTest-env2\nteardownWorker-env2');
});

test('should teardown env after timeout', async ({ runInlineTest }, testInfo) => {
  const file = testInfo.outputPath('log.txt');
  require('fs').writeFileSync(file, '', 'utf8');
  const result = await runInlineTest({
    'folio.config.ts': `
      class MyEnv {
        async teardownWorker() {
          require('fs').appendFileSync(process.env.TEST_FILE, 'teardownWorker\\n', 'utf8');
        }
        async teardownTest() {
          require('fs').appendFileSync(process.env.TEST_FILE, 'teardownTest\\n', 'utf8');
        }
      }
      export const test = folio.test;
      test.runWith(new MyEnv());
    `,
    'a.spec.ts': `
      import { test } from './folio.config';
      test('test', async ({}) => {
        await new Promise(() => {});
      });
    `,
  }, { timeout: 1000 }, { TEST_FILE: file });
  expect(result.results[0].status).toBe('timedOut');
  const content = require('fs').readFileSync(file, 'utf8');
  expect(content).toContain('teardownTest');
  expect(content).toContain('teardownWorker');
});

test('should initialize env once across files', async ({ runInlineTest }) => {
  const { passed, failed, output } = await runInlineTest({
    'folio.config.js': `
      global.logs = [];
      class MyEnv {
        async setupWorker() {
          global.logs.push('setupWorker');
        }
        async teardownWorker() {
          global.logs.push('teardownWorker');
          console.log(global.logs.join('\\n'));
        }
      }
      exports.test = folio.test;
      exports.test.runWith(new MyEnv());
    `,
    'a.test.js': `
      const {test} = require('./folio.config');
      test('should work', async ({}) => {
        global.logs.push('test1');
      });
    `,
    'b.test.js': `
      const {test} = require('./folio.config');
      test('should work', async ({}) => {
        global.logs.push('test2');
      });
    `,
  }, { workers: 1 });
  expect(passed).toBe(2);
  expect(failed).toBe(0);
  expect(output).toContain('setupWorker\ntest1\ntest2\nteardownWorker');
});

test('should run sync env methods and hooks', async ({ runInlineTest }) => {
  const { passed } = await runInlineTest({
    'folio.config.ts': `
      class Env {
        setupWorker() {
          this.counter = 0;
        }
        setupTest() {
          return { counter: this.counter };
        }
        teardownTest() {
          this.counter++;
        }
        teardownWorker() {
        }
      }
      export const test = folio.test;
      test.runWith(new Env());
    `,
    'a.test.js': `
      const { test } = require('./folio.config');
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
