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
import { folio } from './fixtures';
const { it, expect } = folio;

it('env should work', async ({ runInlineTest }) => {
  const { results, output } = await runInlineTest({
    'folio.config.ts': `
      global.logs = [];
      class MyEnv {
        async beforeAll() {
          global.logs.push('beforeAll');
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
      export const test = folio.newTestType();
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
  expect(output).toContain('beforeAll\nbeforeEach\ntest1\nafterEach\nbeforeEach\ntest2\nafterEach\nafterAll');
});

const multipleEnvs = {
  'folio.config.js': `
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
    exports.fooTest = folio.newTestType();
    exports.barTest = folio.newTestType();
    exports.fooTest.runWith('suite1', new MyEnv('-env1'));
    exports.fooTest.runWith('suite2', new MyEnv('-env2'));
    exports.barTest.runWith('suite3', new MyEnv('-env3'));
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

it('multiple envs and suites should work', async ({ runInlineTest }) => {
  const { passed, failed, output } = await runInlineTest(multipleEnvs);
  expect(passed).toBe(4);
  expect(failed).toBe(0);
  expect(output).toContain('beforeAll-env1\nbeforeEach-env1\nfooTest\nafterEach-env1\nafterAll-env1');
  expect(output).toContain('beforeAll-env2\nbeforeEach-env2\nfooTest\nafterEach-env2\nafterAll-env2');
  expect(output).toContain('beforeAll-env3\nbeforeEach-env3\nbarTest1\nafterEach-env3\nbeforeEach-env3\nbarTest2\nafterEach-env3\nafterAll-env3');
});

it('should filter by suites', async ({ runInlineTest }) => {
  const { passed, failed, output } = await runInlineTest(multipleEnvs, { args: ['suite2', 'suite1'] });
  expect(passed).toBe(2);
  expect(failed).toBe(0);
  expect(output).toContain('beforeAll-env1\nbeforeEach-env1\nfooTest\nafterEach-env1\nafterAll-env1');
  expect(output).toContain('beforeAll-env2\nbeforeEach-env2\nfooTest\nafterEach-env2\nafterAll-env2');
});

it('should teardown env after timeout', async ({ runInlineTest, testInfo }) => {
  const file = testInfo.outputPath('log.txt');
  require('fs').writeFileSync(file, '', 'utf8');
  const result = await runInlineTest({
    'folio.config.ts': `
      class MyEnv {
        async afterAll() {
          require('fs').appendFileSync(process.env.TEST_FILE, 'afterAll\\n', 'utf8');
        }
        async afterEach() {
          require('fs').appendFileSync(process.env.TEST_FILE, 'afterEach\\n', 'utf8');
        }
      }
      export const test = folio.newTestType();
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
  expect(content).toContain('afterEach');
  expect(content).toContain('afterAll');
});

it('should initialize env once across files', async ({ runInlineTest }) => {
  const { passed, failed, output } = await runInlineTest({
    'folio.config.js': `
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
      exports.test = folio.newTestType();
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
  expect(output).toContain('beforeAll\ntest1\ntest2\nafterAll');
});

it('multiple envs for a single test type should work', async ({ runInlineTest }) => {
  const { passed } = await runInlineTest({
    'folio.config.ts': `
      class Env1 {
        async beforeEach(testInfo) {
          return { env1: testInfo.title + '-env1' };
        }
      }
      class Env2 {
        async beforeEach(testInfo) {
          return { env2: testInfo.title + '-env2' };
        }
      }
      export const test = folio.newTestType();
      test.runWith(new Env1(), new Env2());
    `,
    'a.test.js': `
      const { test } = require('./folio.config');
      test('should work', async ({env1, env2}) => {
        expect(env1).toBe('should work-env1');
        expect(env2).toBe('should work-env2');
      });
    `,
  });
  expect(passed).toBe(1);
});
