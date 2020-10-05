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

import colors from 'colors/safe';
import * as fs from 'fs';
import { fixtures } from './fixtures';
const { it, expect } = fixtures;

it('should support golden', async ({runInlineTest}) => {
  const result = await runInlineTest({
    '__snapshots__/a/is-a-test/snapshot.txt': `"Hello world"`,
    'a.spec.js': `
      it('is a test', ({testPrint}) => {
        testPrint('Hello world');
      });
    `
  });
  expect(result.exitCode).toBe(0);
});

it('should fail on wrong golden', async ({runInlineTest}) => {
  const result = await runInlineTest({
    '__snapshots__/a/is-a-test/snapshot.txt': `"Line1"
"Line2"
"Line3"
Hello world line1"
"Line5"
"Line6"
"Line7"`,
    'a.spec.js': `
      it('is a test', ({testPrint}) => {
        testPrint('Line1');
        testPrint('Line22');
        testPrint('Line3');
        testPrint('Hi world line2');
        testPrint('Line5');
        testPrint('Line6');
        testPrint('Line7');
        testPrint({a: { b: { c: 1 }}})
      });
    `
  });
  expect(result.exitCode).toBe(1);
  expect(result.output).toContain('"Line1"');
  expect(result.output).toContain('"Line2' + colors.green('2'));
  expect(result.output).toContain('line' + colors.strikethrough(colors.red('1')) + colors.green('2'));
  expect(result.output).toContain('"Line3"');
  expect(result.output).toContain('"Line5"');
  expect(result.output).toContain('"Line7"');
  expect(result.output).toContain('Object {');
});

it('should write missing expectations', async ({runInlineTest, testInfo}) => {
  const result = await runInlineTest({
    'a.spec.js': `
      it('is a test', ({testPrint}) => {
        testPrint('Hello world');
      });
    `
  });
  expect(result.exitCode).toBe(1);
  expect(result.output).toContain('snapshot.txt is missing in golden results, writing actual');
  const data = fs.readFileSync(testInfo.outputPath('__snapshots__/a/is-a-test/snapshot.txt'));
  expect(data.toString()).toBe('"Hello world"');
});

it('should update expectations', async ({runInlineTest, testInfo}) => {
  const result = await runInlineTest({
    '__snapshots__/a/is-a-test/snapshot.txt': `"Hello world"`,
    'a.spec.js': `
      it('is a test', ({testPrint}) => {
        testPrint('Hello world updated');
      });
    `
  }, { 'update-snapshots': true });
  expect(result.exitCode).toBe(0);
  expect(result.output).toContain('Updating snapshot at');
  expect(result.output).toContain('snapshot.txt');
  const data = fs.readFileSync(testInfo.outputPath('__snapshots__/a/is-a-test/snapshot.txt'));
  expect(data.toString()).toBe('"Hello world updated"');
});
