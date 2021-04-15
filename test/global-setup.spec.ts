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

test('globalSetup and globalTeardown should work', async ({ runInlineTest }) => {
  const { results, output } = await runInlineTest({
    'folio.config.ts': `
      let value;
      folio.globalSetup(async () => {
        await new Promise(f => setTimeout(f, 100));
        value = 42;
        process.env.FOO = String(value);
      });
      folio.globalTeardown(() => {
        console.log('teardown=' + value);
      });
      // Second global setup.
      folio.globalSetup(async () => {
        process.env.BAR = 'baz';
      });
      export const test = folio.test;
      test.runWith();
    `,
    'a.test.js': `
      const { test } = require('./folio.config');
      test('should work', async ({}, testInfo) => {
        expect(process.env.FOO).toBe('42');
        expect(process.env.BAR).toBe('baz');
      });
    `,
  });
  expect(results[0].status).toBe('passed');
  expect(output).toContain('teardown=42');
});

test('globalTeardown runs after failures', async ({ runInlineTest }) => {
  const { results, output } = await runInlineTest({
    'folio.config.ts': `
      let value;
      folio.globalSetup(async () => {
        await new Promise(f => setTimeout(f, 100));
        value = 42;
        process.env.FOO = String(value);
      });
      folio.globalTeardown(() => {
        console.log('teardown=' + value);
      });
      export const test = folio.test;
      test.runWith();
    `,
    'a.test.js': `
      const { test } = require('./folio.config');
      test('should work', async ({}, testInfo) => {
        expect(process.env.FOO).toBe('43');
      });
    `,
  });
  expect(results[0].status).toBe('failed');
  expect(output).toContain('teardown=42');
});

test('globalTeardown does not run when globalSetup times out', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'folio.config.ts': `
      folio.globalSetup(async () => {
        await new Promise(f => setTimeout(f, 10000));
        return 42;
      });
      folio.globalTeardown(() => {
        console.log('teardown=');
      });
      export const test = folio.test;
      test.runWith();
      folio.setConfig({ globalTimeout: 1000 });
    `,
    'a.test.js': `
      const { test } = require('./folio.config');
      test('should not run', async ({}, testInfo) => {
      });
    `,
  });
  // We did not collect tests, so everything should be zero.
  expect(result.skipped).toBe(0);
  expect(result.passed).toBe(0);
  expect(result.failed).toBe(0);
  expect(result.output).toContain('Timed out waiting 1s for the entire test run');
  expect(result.output).not.toContain('teardown=');
});

test('globalSetup should be run before requiring tests', async ({ runInlineTest }) => {
  const { passed } = await runInlineTest({
    'folio.config.ts': `
      folio.globalSetup(async () => {
        process.env.FOO = JSON.stringify({ foo: 'bar' });
      });
      export const test = folio.test;
      test.runWith();
    `,
    'a.test.js': `
      const { test } = require('./folio.config');
      let value = JSON.parse(process.env.FOO);
      test('should work', async ({}) => {
        expect(value).toEqual({ foo: 'bar' });
      });
    `,
  });
  expect(passed).toBe(1);
});

test('globalSetup should throw in the test file', async ({ runInlineTest }) => {
  const { output } = await runInlineTest({
    'a.test.js': `
      folio.globalSetup(() => {});
      test('should work', async ({}) => {
      });
    `,
  });
  expect(output).toContain(`globalSetup() can only be called in a configuration file.`);
});

test('globalSetup should throw when passed non-function', async ({ runInlineTest }) => {
  const { output } = await runInlineTest({
    'a.test.js': `
      folio.globalSetup(42);
      test('should work', async ({}) => {
      });
    `,
  });
  expect(output).toContain(`globalSetup() takes a single function argument.`);
});
