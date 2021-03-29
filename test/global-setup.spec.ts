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

it('globalSetup and globalTeardown should work', async ({ runInlineTest }) => {
  const { results, output } = await runInlineTest({
    'folio.config.ts': `
      export async function globalSetup() {
        await new Promise(f => setTimeout(f, 100));
        return 42;
      }
      export async function globalTeardown(value) {
        console.log('teardown=' + value);
      }
      export const test = folio.newTestType();
      export const suite = test.runWith();
    `,
    'a.test.js': `
      const { test } = require('./folio.config');
      test('should work', async ({}, testInfo) => {
        expect(testInfo.globalSetupResult).toBe(42);
      });
    `,
  });
  expect(results[0].status).toBe('passed');
  expect(output).toContain('teardown=42');
});

it('globalTeardown runs after failures', async ({ runInlineTest }) => {
  const { results, output } = await runInlineTest({
    'folio.config.ts': `
      export async function globalSetup() {
        await new Promise(f => setTimeout(f, 100));
        return 42;
      }
      export async function globalTeardown(value) {
        console.log('teardown=' + value);
      }
      export const test = folio.newTestType();
      export const suite = test.runWith();
    `,
    'a.test.js': `
      const { test } = require('./folio.config');
      test('should work', async ({}, testInfo) => {
        expect(testInfo.globalSetupResult).toBe(43);
      });
    `,
  });
  expect(results[0].status).toBe('failed');
  expect(output).toContain('teardown=42');
});

it('globalTeardown does not run when globalSetup times out', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'folio.config.ts': `
      export async function globalSetup() {
        await new Promise(f => setTimeout(f, 10000));
        return 42;
      }
      export async function globalTeardown(value) {
        console.log('teardown=' + value);
      }
      export const test = folio.newTestType();
      export const suite = test.runWith();
      export const config = { globalTimeout: 1000 };
    `,
    'a.test.js': `
      const { test } = require('./folio.config');
      test('should not run', async ({}, testInfo) => {
      });
    `,
  });
  expect(result.skipped).toBe(1);
  expect(result.output).toContain('Timed out waiting 1s for the entire test run');
  expect(result.output).not.toContain('teardown=');
});
