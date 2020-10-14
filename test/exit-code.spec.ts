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

import path from 'path';
import { folio, stripAscii } from './fixtures';
const { it, expect } = folio;

function monotonicTime(): number {
  const [seconds, nanoseconds] = process.hrtime();
  return seconds * 1000 + (nanoseconds / 1000000 | 0);
}

it('should collect stdio', async ({ runTest }) => {
  const { exitCode, report } = await runTest('stdio.js');
  expect(exitCode).toBe(0);
  const testResult = report.suites[0].specs[0].tests[0].runs[0];
  const { stdout, stderr } = testResult;
  expect(stdout).toEqual([{ text: 'stdout text' }, { buffer: Buffer.from('stdout buffer').toString('base64') }]);
  expect(stderr).toEqual([{ text: 'stderr text' }, { buffer: Buffer.from('stderr buffer').toString('base64') }]);
});

it('should work with not defined errors', async ({runTest}) => {
  const result = await runTest('is-not-defined-error.ts');
  expect(stripAscii(result.output)).toContain('foo is not defined');
  expect(result.exitCode).toBe(1);
});

it('should work with typescript', async ({ runTest }) => {
  const result = await runTest('typescript.ts');
  expect(result.exitCode).toBe(0);
});

it('should repeat each', async ({ runTest }) => {
  const { exitCode, report } = await runTest('one-success.js', { 'repeat-each': 3 });
  expect(exitCode).toBe(0);
  expect(report.suites.length).toBe(1);
  expect(report.suites[0].specs.length).toBe(1);
  expect(report.suites[0].specs[0].tests.length).toBe(3);
});

it('should allow flaky', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'a.test.js': `
      it('flake', test => {
        test.flaky();
      }, async ({ testInfo }) => {
        expect(testInfo.retry).toBe(1);
      });
    `,
  }, { retries: 1 });
  expect(result.exitCode).toBe(0);
  expect(result.expectedFlaky).toBe(1);
  expect(result.unexpectedFlaky).toBe(0);
});

it('should fail on unexpected pass', async ({ runTest }) => {
  const { exitCode, failed, output } = await runTest('unexpected-pass.js');
  expect(exitCode).toBe(1);
  expect(failed).toBe(1);
  expect(output).toContain('passed unexpectedly');
});

it('should respect global timeout', async ({ runTest }) => {
  const now = monotonicTime();
  const { exitCode, output } = await runTest('one-timeout.js', { 'timeout': 100000, 'global-timeout': 3000 });
  expect(exitCode).toBe(1);
  expect(output).toContain('Timed out waiting 3s for the entire test run');
  expect(monotonicTime() - now).toBeGreaterThan(2900);
});

it('should exit with code 1 if the specified folder/file does not exist', async ({runTest}) => {
  const result = await runTest('111111111111.js');
  expect(result.exitCode).toBe(1);
  expect(result.output).toContain(`${path.join(__dirname, 'assets', '111111111111.js')} does not exist`);
});
