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
import { expect } from '@playwright/test-runner';
import { fixtures } from './fixtures';
const { it } = fixtures;

it('should work', async ({ runInlineFixturesTest }) => {
  const { results } = await runInlineFixturesTest({
    'a.test.js': `
      const { it } = baseFixtures.defineTestFixtures({
        asdf: async ({}, test) => await test(123)
      });
      it('should use asdf', async ({asdf}) => {
        expect(asdf).toBe(123);
      });
    `,
  });
  expect(results[0].status).toBe('passed');
});

it('should work with a sync function', async ({ runInlineFixturesTest }) => {
  const { results } = await runInlineFixturesTest({
    'a.test.js': `
      const { it } = baseFixtures.defineTestFixtures({
        asdf: async ({}, test) => await test(123)
      });
      it('should use asdf', ({asdf}) => {
        expect(asdf).toBe(123);
      });
    `,
  });
  expect(results[0].status).toBe('passed');
});

it('should work with a non-arrow function', async ({ runInlineFixturesTest }) => {
  const { results } = await runInlineFixturesTest({
    'a.test.js': `
      const { it } = baseFixtures.defineTestFixtures({
        asdf: async ({}, test) => await test(123)
      });
      it('should use asdf', function ({asdf}) {
        expect(asdf).toBe(123);
      });
    `,
  });
  expect(results[0].status).toBe('passed');
});

it('should work with a named function', async ({ runInlineFixturesTest }) => {
  const { results } = await runInlineFixturesTest({
    'a.test.js': `
      const { it } = baseFixtures.defineTestFixtures({
        asdf: async ({}, test) => await test(123)
      });
      it('should use asdf', async function hello({asdf}) {
        expect(asdf).toBe(123);
      });
    `,
  });
  expect(results[0].status).toBe('passed');
});

it('should work with renamed parameters', async ({ runInlineFixturesTest }) => {
  const { results } = await runInlineFixturesTest({
    'a.test.js': `
      const { it } = baseFixtures.defineTestFixtures({
        asdf: async ({}, test) => await test(123)
      });
      it('should use asdf', function ({asdf: renamed}) {
        expect(renamed).toBe(123);
      });
    `,
  });
  expect(results[0].status).toBe('passed');
});

it('should fail if parameters are not destructured', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'a.test.js': `
      const { it } = baseFixtures.defineTestFixtures({
        asdf: async ({}, test) => await test(123)
      });
      it('should pass', function () {
        expect(1).toBe(1);
      });
      it('should use asdf', function (abc) {
        expect(abc.asdf).toBe(123);
      });
    `,
  });
  expect(result.passed).toBe(1);
  expect(result.failed).toBe(1);
  expect(result.output).toContain('First argument must use the object destructuring pattern.');
  expect(result.output).toContain('a.test.js');
});

it('should fail with an unknown fixture', async ({ runInlineTest }) => {
  const { results } = await runInlineTest({
    'a.test.js': `
      it('should use asdf', async ({asdf}) => {
        expect(asdf).toBe(123);
      });
    `,
  });
  expect(results[0].status).toBe('failed');
  expect(results[0].error.message).toBe('Unknown fixture: asdf');
});

it('should run the fixture every time', async ({ runInlineFixturesTest }) => {
  const { results } = await runInlineFixturesTest({
    'a.test.js': `
      let counter = 0;
      const { it } = baseFixtures.defineTestFixtures({
        asdf: async ({}, test) => await test(counter++)
      });
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

it('should only run worker fixtures once', async ({ runInlineFixturesTest }) => {
  const { results } = await runInlineFixturesTest({
    'a.test.js': `
      let counter = 0;
      const { it } = baseFixtures.defineWorkerFixtures({
        asdf: async ({}, test) => await test(counter++)
      });
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

it('each file should get their own fixtures', async ({ runInlineFixturesTest }) => {
  const { results } = await runInlineFixturesTest({
    'a.test.js': `
      const { it } = baseFixtures.defineWorkerFixtures({
        worker: async ({}, test) => await test('worker-a'),
      }).defineTestFixtures({
        test: async ({}, test) => await test('test-a'),
      });
      it('should use worker', async ({worker, test}) => {
        expect(worker).toBe('worker-a');
        expect(test).toBe('test-a');
      });
    `,
    'b.test.js': `
      const { it } = baseFixtures.defineWorkerFixtures({
        worker: async ({}, test) => await test('worker-b'),
      }).defineTestFixtures({
        test: async ({}, test) => await test('test-b'),
      });
      it('should use worker', async ({worker, test}) => {
        expect(worker).toBe('worker-b');
        expect(test).toBe('test-b');
      });
    `,
    'c.test.js': `
      const { it } = baseFixtures.defineWorkerFixtures({
        worker: async ({}, test) => await test('worker-c'),
      }).defineTestFixtures({
        test: async ({}, test) => await test('test-c'),
      });
      it('should use worker', async ({worker, test}) => {
        expect(worker).toBe('worker-c');
        expect(test).toBe('test-c');
      });
    `,
  });
  expect(results.map(r => r.status)).toEqual(['passed', 'passed', 'passed']);
});

it('tests should be able to share worker fixtures', async ({ runInlineFixturesTest }) => {
  const { results } = await runInlineFixturesTest({
    'worker.js': `
      global.counter = 0;
      module.exports = baseFixtures.defineWorkerFixtures({
        worker: async ({}, test) => await test(global.counter++)
      });
    `,
    'a.test.js': `
      const { it } = require('./worker.js');
      it('should use worker', async ({worker}) => {
        expect(worker).toBe(0);
      });
    `,
    'b.test.js': `
      const { it } = require('./worker.js');
      it('should use worker', async ({worker}) => {
        expect(worker).toBe(0);
      });
    `,
    'c.test.js': `
      const { it } = require('./worker.js');
      it('should use worker', async ({worker}) => {
        expect(worker).toBe(0);
      });
    `,
  });
  expect(results.map(r => r.status)).toEqual(['passed', 'passed', 'passed']);
});

it('tests respect automatic test fixtures', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'a.test.js': `
      let counter = 0;
      const { it } = baseFixtures.defineTestFixtures({
        automaticTestFixture: async ({}, runTest) => {
          ++counter;
          await runTest();
        },
      });
      it('test 1', async ({}) => {
        expect(counter).toBe(1);
      });
      it('test 2', async ({}) => {
        expect(counter).toBe(2);
      });
    `
  });
  expect(result.exitCode).toBe(0);
  expect(result.results.map(r => r.status)).toEqual(['passed', 'passed']);
});

it('tests respect automatic worker fixtures', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'a.test.js': `
      let counter = 0;
      const { it } = baseFixtures.defineWorkerFixtures({
        automaticWorkerFixture: async ({}, runTest) => {
          ++counter;
          await runTest();
        },
      });
      it('test 1', async ({}) => {
        expect(counter).toBe(1);
      });
      it('test 2', async ({}) => {
        expect(counter).toBe(1);
      });
    `
  });
  expect(result.exitCode).toBe(0);
  expect(result.results.map(r => r.status)).toEqual(['passed', 'passed']);
});

it('tests does not run non-automatic worker fixtures', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'a.test.js': `
      let counter = 0;
      const { it } = baseFixtures.defineTestFixtures({
        nonAutomaticWorkerFixture: async ({}, runTest) => {
          ++counter;
          await runTest();
        },
      });
      it('test 1', async ({}) => {
        expect(counter).toBe(0);
      });
    `
  });
  expect(result.exitCode).toBe(0);
  expect(result.results.map(r => r.status)).toEqual(['passed']);
});

it('should not reuse fixtures from one file in another one', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'a.spec.ts': `
      const { it } = baseFixtures.defineTestFixtures({
        foo: async ({}, runTest) => {
          await runTest();
        },
      });
      it('test1', async ({}) => {});
    `,
    'b.spec.ts': `
      const { it } = baseFixtures;
      it('test1', async ({}) => {});
      it('test2', async ({foo}) => {});
    `,
  });
  expect(result.results[2].error.message).toContain('Unknown fixture: foo');
  expect(result.exitCode).toBe(1);
});
