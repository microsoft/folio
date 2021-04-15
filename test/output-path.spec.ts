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
import { test, expect } from './config';

test('should include repeat token', async ({runInlineTest}) => {
  const result = await runInlineTest({
    'a.spec.js': `
      test('test', ({}, testInfo) => {
        if (testInfo.repeatEachIndex)
          expect(testInfo.outputPath('')).toContain('repeat' + testInfo.repeatEachIndex);
        else
          expect(testInfo.outputPath('')).not.toContain('repeat' + testInfo.repeatEachIndex);
      });
    `
  }, { 'repeat-each': 3 });
  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(3);
});

test('should include retry token', async ({runInlineTest}) => {
  const result = await runInlineTest({
    'a.spec.js': `
      test('test', ({}, testInfo) => {
        expect(testInfo.outputPath('')).toContain('retry' + testInfo.retry);
        expect(testInfo.retry).toBe(2);
      });
    `
  }, { 'retries': 2 });
  expect(result.exitCode).toBe(0);
  expect(result.flaky).toBe(1);
});

test('should include tag', async ({runInlineTest}) => {
  const result = await runInlineTest({
    'folio.config.ts': `
      export const test = folio.test;
      test.runWith({ tag: 'my-title' });
    `,
    'a.spec.js': `
      const { test } = require('./folio.config');
      test('test', ({}, testInfo) => {
        expect(testInfo.outputPath('')).toContain('my-title');
      });
    `
  }, { 'retries': 2 });
  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(1);
});

test('should remove output paths', async ({runInlineTest}, testInfo) => {
  const paths: string[] = [];
  const files: string[] = [];

  for (let i = 0; i < 3; i++) {
    const p = testInfo.outputPath('path' + i);
    await fs.promises.mkdir(p, { recursive: true });
    const f = path.join(p, 'my-file.txt');
    await fs.promises.writeFile(f, 'contents', 'utf-8');
    paths.push(p);
    files.push(f);
  }

  const result = await runInlineTest({
    'folio.config.js': `
      exports.test = folio.test;
      exports.test.runWith({ outputDir: ${JSON.stringify(paths[0])} });
      exports.test.runWith({ outputDir: ${JSON.stringify(paths[2])} });
    `,
    'a.test.js': `
      const { test } = require('./folio.config');
      test('my test', ({}, testInfo) => {});
    `
  });
  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(2);

  expect(fs.existsSync(files[0])).toBe(false);
  expect(fs.existsSync(files[1])).toBe(true);
  expect(fs.existsSync(files[2])).toBe(false);
});
