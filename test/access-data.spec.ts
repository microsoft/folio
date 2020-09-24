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

import * as fs from 'fs';
import * as path from 'path';
import { fixtures } from './fixtures';
const { it, expect } = fixtures;

it('should access error in fixture', async ({ runTest, outputDir }) => {
  const textFile = path.join(outputDir, 'test-error-visible-in-fixture.txt');
  const result = await runTest('test-error-visible-in-fixture.ts', {});
  expect(result.exitCode).toBe(1);
  const data = JSON.parse(fs.readFileSync(textFile).toString());
  expect(data.message).toContain('Object.is equality');
});

it('should access data in fixture', async ({ runTest }) => {
  const { exitCode, report } = await runTest('test-data-visible-in-fixture.ts');
  expect(exitCode).toBe(0);
  const testResult = report.suites[0].specs[0].tests[0].runs[0];
  expect(testResult.data).toEqual({ 'myname': 'myvalue' });
  expect(testResult.stdout).toEqual([{ text: 'console.log\n' }]);
  expect(testResult.stderr).toEqual([{ text: 'console.error\n' }]);
});
