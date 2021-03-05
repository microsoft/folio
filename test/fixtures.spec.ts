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
import { firstStackFrame, folio, stripAscii } from './fixtures';
const { it, expect } = folio;

it('should work', async ({ runInlineTest }) => {
  const { results } = await runInlineTest({
    'fixtures.ts': `
      async function asdf({}, runTest) {
        await runTest(123);
      }
      export const toBeRenamed = { testFixtures: { asdf } };
    `,
    'a.test.js': `
      it('should use asdf', async ({asdf}) => {
        expect(asdf).toBe(123);
      });
    `,
  });
  expect(results[0].status).toBe('passed');
});

it('should work with a sync function', async ({ runInlineTest }) => {
  const { results } = await runInlineTest({
    'fixtures.ts': `
      async function asdf({}, runTest) {
        await runTest(123);
      }
      export const toBeRenamed = { testFixtures: { asdf } };
    `,
    'a.test.js': `
      it('should use asdf', ({asdf}) => {
        expect(asdf).toBe(123);
      });
    `,
  });
  expect(results[0].status).toBe('passed');
});

it('should work with a non-arrow function', async ({ runInlineTest }) => {
  const { results } = await runInlineTest({
    'fixtures.ts': `
      async function asdf({}, runTest) {
        await runTest(123);
      }
      export const toBeRenamed = { testFixtures: { asdf } };
    `,
    'a.test.js': `
      it('should use asdf', function ({asdf}) {
        expect(asdf).toBe(123);
      });
    `,
  });
  expect(results[0].status).toBe('passed');
});

it('should work with a named function', async ({ runInlineTest }) => {
  const { results } = await runInlineTest({
    'fixtures.ts': `
      async function asdf({}, runTest) {
        await runTest(123);
      }
      export const toBeRenamed = { testFixtures: { asdf } };
    `,
    'a.test.js': `
      it('should use asdf', async function hello({asdf}) {
        expect(asdf).toBe(123);
      });
    `,
  });
  expect(results[0].status).toBe('passed');
});

it('should work with renamed parameters', async ({ runInlineTest }) => {
  const { results } = await runInlineTest({
    'fixtures.ts': `
      async function asdf({}, runTest) {
        await runTest(123);
      }
      export const toBeRenamed = { testFixtures: { asdf } };
    `,
    'a.test.js': `
      it('should use asdf', function ({asdf: renamed}) {
        expect(renamed).toBe(123);
      });
    `,
  });
  expect(results[0].status).toBe('passed');
});

it('should fail if parameters are not destructured', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'a.test.js': `
      it('should pass', function () {
        expect(1).toBe(1);
      });
      it('should use asdf', function (abc) {
        expect(abc.asdf).toBe(123);
      });
    `,
  });
  expect(stripAscii(result.output)).toContain('First argument must use the object destructuring pattern: abc');
  expect(firstStackFrame(stripAscii(result.output))).toContain('a.test.js:8');
  expect(result.results.length).toBe(0);
});

it('should fail with an unknown fixture', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'a.test.js': `
      it('should use asdf', async ({asdf}) => {
        expect(asdf).toBe(123);
      });
    `,
  });
  expect(stripAscii(result.output)).toContain('Test has unknown parameter "asdf".');
  expect(firstStackFrame(stripAscii(result.output))).toContain('a.test.js:5');
  expect(result.results.length).toBe(0);
});

it('should run the fixture every time', async ({ runInlineTest }) => {
  const { results } = await runInlineTest({
    'fixtures.ts': `
      let counter = 0;
      async function asdf({}, runTest) {
        await runTest(counter++);
      }
      export const toBeRenamed = { testFixtures: { asdf } };
    `,
    'a.test.js': `
      it('should use asdf', async ({asdf}) => {
        expect(asdf).toBe(0);
      });
      it('should use asdf', async ({asdf}) => {
        expect(asdf).toBe(1);
      });
      it('should use asdf', async ({asdf}) => {
        expect(asdf).toBe(2);
      });
    `,
  });
  expect(results.map(r => r.status)).toEqual(['passed', 'passed', 'passed']);
});

it('should only run worker fixtures once', async ({ runInlineTest }) => {
  const { results } = await runInlineTest({
    'fixtures.ts': `
      let counter = 0;
      async function asdf({}, runTest) {
        await runTest(counter++);
      }
      export const toBeRenamed = { workerFixtures: { asdf } };
    `,
    'a.test.js': `
      it('should use asdf', async ({asdf}) => {
        expect(asdf).toBe(0);
      });
      it('should use asdf', async ({asdf}) => {
        expect(asdf).toBe(0);
      });
      it('should use asdf', async ({asdf}) => {
        expect(asdf).toBe(0);
      });
    `,
  });
  expect(results.map(r => r.status)).toEqual(['passed', 'passed', 'passed']);
});

it('all files should share fixtures', async ({ runInlineTest }) => {
  const { results } = await runInlineTest({
    'fixtures.ts': `
      async function worker({}, runTest) {
        await runTest('worker');
      }
      async function testFixture({}, runTest) {
        await runTest('test');
      }
      export const toBeRenamed = { testFixtures: { testFixture }, workerFixtures: { worker } };
    `,
    'a.test.js': `
      it('should use worker', async ({worker, testFixture}) => {
        expect(worker).toBe('worker');
        expect(testFixture).toBe('test');
      });
    `,
    'b.test.js': `
      it('should use worker', async ({worker, testFixture}) => {
        expect(worker).toBe('worker');
        expect(testFixture).toBe('test');
      });
    `,
    'c.test.js': `
      it('should use worker', async ({worker, testFixture}) => {
        expect(worker).toBe('worker');
        expect(testFixture).toBe('test');
      });
    `,
  });
  expect(results.map(r => r.status)).toEqual(['passed', 'passed', 'passed']);
});

it('tests respect automatic test fixtures', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'fixtures.ts': `
      global.counter = 0;
      async function automaticTestFixture({}, runTest) {
        ++global.counter;
        await runTest();
      }
      export const toBeRenamed = { autoTestFixtures: { automaticTestFixture } };
    `,
    'a.test.js': `
      it('test 1', async ({}) => {
        expect(global.counter).toBe(1);
      });
      it('test 2', async ({}) => {
        expect(global.counter).toBe(2);
      });
    `
  });
  expect(result.exitCode).toBe(0);
  expect(result.results.map(r => r.status)).toEqual(['passed', 'passed']);
});

it('tests respect automatic worker fixtures', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'fixtures.ts': `
      global.counter = 0;
      async function automaticWorkerFixture({}, runTest) {
        ++global.counter;
        await runTest();
      }
      export const toBeRenamed = { autoWorkerFixtures: { automaticWorkerFixture } };
    `,
    'a.test.js': `
      it('test 1', async ({}) => {
        expect(global.counter).toBe(1);
      });
      it('test 2', async ({}) => {
        expect(global.counter).toBe(1);
      });
    `
  });
  expect(result.exitCode).toBe(0);
  expect(result.results.map(r => r.status)).toEqual(['passed', 'passed']);
});

it('tests does not run non-automatic worker fixtures', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'fixtures.ts': `
      global.counter = 0;
      async function workerFixture({}, runTest) {
        ++global.counter;
        await runTest();
      }
      export const toBeRenamed = { workerFixtures: { workerFixture } };
    `,
    'a.test.js': `
      it('test 1', async ({}) => {
        expect(global.counter).toBe(0);
      });
    `
  });
  expect(result.exitCode).toBe(0);
  expect(result.results.map(r => r.status)).toEqual(['passed']);
});

it('should teardown fixtures after timeout', async ({ runInlineTest, testInfo }) => {
  const file = testInfo.outputPath('log.txt');
  require('fs').writeFileSync(file, '', 'utf8');
  const result = await runInlineTest({
    'fixtures.ts': `
      async function t({ file }, runTest) {
        await runTest('t');
        require('fs').appendFileSync(file, 'test fixture teardown\\n', 'utf8');
      }
      async function w({ file }, runTest) {
        await runTest('w');
        require('fs').appendFileSync(file, 'worker fixture teardown\\n', 'utf8');
      }
      export const toBeRenamed = {
        testFixtures: { t },
        workerFixtures: { w },
        parameters: { file: { defaultValue: '', description: 'File' } }
      };
    `,
    'a.spec.ts': `
      it('test', async ({t, w}) => {
        expect(t).toBe('t');
        expect(w).toBe('w');
        await new Promise(() => {});
      });
    `,
  }, { timeout: 1000, param: 'file=' + file });
  expect(result.results[0].status).toBe('timedOut');
  const content = require('fs').readFileSync(file, 'utf8');
  expect(content).toContain('worker fixture teardown');
  expect(content).toContain('test fixture teardown');
});
