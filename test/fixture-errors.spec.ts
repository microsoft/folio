/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { fixtures } from './fixtures';
const { it, expect } = fixtures;

it('should handle fixture timeout', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'a.spec.ts': `
      const { it, defineTestFixture } = baseFixtures;

      defineTestFixture('timeout', async ({}, runTest) => {
        await runTest();
        await new Promise(f => setTimeout(f, 100000));
      });
      
      it('fixture timeout', async ({timeout}) => {
        expect(1).toBe(1);
      });
      
      it('failing fixture timeout', async ({timeout}) => {
        expect(1).toBe(2);
      });
    `
  }, { timeout: 500 });
  expect(result.exitCode).toBe(1);
  expect(result.output).toContain('Timeout of 500ms');
  expect(result.failed).toBe(1);
  expect(result.timedOut).toBe(1);
});

it('should handle worker fixture timeout', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'a.spec.ts': `
      const { it, defineWorkerFixture } = baseFixtures;

      defineWorkerFixture('timeout', async ({}, runTest) => {
      });
      
      it('fails', async ({timeout}) => {
      });
    `
  }, { timeout: 500 });
  expect(result.exitCode).toBe(1);
  expect(result.output).toContain('Timeout of 500ms');
});

it('should handle worker fixture error', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'a.spec.ts': `
      const { it, defineWorkerFixture } = baseFixtures;

      defineWorkerFixture('failure', async ({}, runTest) => {
        throw new Error('Worker failed');
      });
      
      it('fails', async ({failure}) => {
      });    
    `
  });
  expect(result.exitCode).toBe(1);
  expect(result.failed).toBe(1);
  expect(result.output).toContain('Worker failed');
});

it('should handle worker tear down fixture error', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'a.spec.ts': `
      const { it, defineWorkerFixture } = baseFixtures;

      defineWorkerFixture('failure', async ({}, runTest) => {
        await runTest();
        throw new Error('Worker failed');
      });
      
      it('pass', async ({failure}) => {
        expect(true).toBe(true);
      });    
    `
  });
  expect(result.report.errors[0].error.message).toContain('Worker failed');
  expect(result.exitCode).toBe(1);
});
