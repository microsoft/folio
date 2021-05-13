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

import * as fs from 'fs';
import * as path from 'path';
import { test, expect } from './folio-test';

test('should work and remove non-failures on CI', async ({ runInlineTest }, testInfo) => {
  const result = await runInlineTest({
    'dir/my-test.spec.js': `
      const { test } = folio;
      test('test 1', async ({}, testInfo) => {
        if (testInfo.retry) {
          expect(testInfo.outputDir).toContain('dir-my-test-test-1-retry' + testInfo.retry);
          expect(testInfo.outputPath('foo', 'bar')).toContain(require('path').join('dir-my-test-test-1-retry' + testInfo.retry, 'foo', 'bar'));
          require('fs').writeFileSync(testInfo.outputPath('file.txt'), 'content', 'utf-8');
        } else {
          expect(testInfo.outputDir).toContain('dir-my-test-test-1');
          expect(testInfo.outputPath()).toContain('dir-my-test-test-1');
          expect(testInfo.outputPath('foo', 'bar')).toContain(require('path').join('dir-my-test-test-1', 'foo', 'bar'));
          require('fs').writeFileSync(testInfo.outputPath('file.txt'), 'content', 'utf-8');
        }
        expect(require('fs').existsSync(testInfo.outputDir)).toBe(true);
        if (testInfo.retry < 2)
          throw new Error('Give me retries');
      });
    `,
  }, { retries: 2 }, { CI: '1' });
  expect(result.exitCode).toBe(0);

  expect(result.results[0].status).toBe('failed');
  expect(result.results[0].retry).toBe(0);
  // Should only fail the last retry check.
  expect(result.results[0].error.message).toBe('Give me retries');

  expect(result.results[1].status).toBe('failed');
  expect(result.results[1].retry).toBe(1);
  // Should only fail the last retry check.
  expect(result.results[1].error.message).toBe('Give me retries');

  expect(result.results[2].status).toBe('passed');
  expect(result.results[2].retry).toBe(2);

  expect(fs.existsSync(testInfo.outputPath('test-results', 'dir-my-test-test-1'))).toBe(true);
  expect(fs.existsSync(testInfo.outputPath('test-results', 'dir-my-test-test-1-retry1'))).toBe(true);
  // Last retry is successfull, so output dir should be removed.
  expect(fs.existsSync(testInfo.outputPath('test-results', 'dir-my-test-test-1-retry2'))).toBe(false);
});

test('should include repeat token', async ({runInlineTest}) => {
  const result = await runInlineTest({
    'a.spec.js': `
      const { test } = folio;
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

test('should include the project name', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'helper.ts': `
      class Env {
        constructor(snapshotPathSegment) {
          this._snapshotPathSegment = snapshotPathSegment;
        }
        async beforeEach(args, testInfo) {
          testInfo.snapshotPathSegment = this._snapshotPathSegment;
          return {};
        }
      }
      export const test = folio.test.extend(new Env('snapshots1'));
      export const test2 = folio.test.extend(new Env('snapshots2'));
    `,
    'folio.config.ts': `
      module.exports = { projects: [
        { name: 'foo' },
        { name: 'foo' },
        { name: 'bar' },
      ] };
    `,
    'my-test.spec.js': `
      const { test, test2 } = require('./helper');
      test('test 1', async ({}, testInfo) => {
        console.log(testInfo.outputPath('bar.txt').replace(/\\\\/g, '/'));
        console.log(testInfo.snapshotPath('bar.txt').replace(/\\\\/g, '/'));
        if (testInfo.retry !== 1)
          throw new Error('Give me a retry');
      });
      test2('test 2', async ({}, testInfo) => {
        console.log(testInfo.outputPath('bar.txt').replace(/\\\\/g, '/'));
        console.log(testInfo.snapshotPath('bar.txt').replace(/\\\\/g, '/'));
      });
    `,
  }, { retries: 1 });
  expect(result.exitCode).toBe(0);
  expect(result.results[0].status).toBe('failed');
  expect(result.results[1].status).toBe('passed');

  // test1, run with foo #1
  expect(result.output).toContain('test-results/my-test-test-1-foo1/bar.txt');
  expect(result.output).toContain('__snapshots__/my-test/test-1/snapshots1/bar.txt');
  expect(result.output).toContain('test-results/my-test-test-1-foo1-retry1/bar.txt');
  expect(result.output).toContain('__snapshots__/my-test/test-1/snapshots1/bar.txt');

  // test1, run with foo #2
  expect(result.output).toContain('test-results/my-test-test-1-foo2/bar.txt');
  expect(result.output).toContain('__snapshots__/my-test/test-1/snapshots1/bar.txt');
  expect(result.output).toContain('test-results/my-test-test-1-foo2-retry1/bar.txt');
  expect(result.output).toContain('__snapshots__/my-test/test-1/snapshots1/bar.txt');

  // test1, run with bar
  expect(result.output).toContain('test-results/my-test-test-1-bar/bar.txt');
  expect(result.output).toContain('__snapshots__/my-test/test-1/snapshots1/bar.txt');
  expect(result.output).toContain('test-results/my-test-test-1-bar-retry1/bar.txt');
  expect(result.output).toContain('__snapshots__/my-test/test-1/snapshots1/bar.txt');

  // test2, run with foo #1
  expect(result.output).toContain('test-results/my-test-test-2-foo1/bar.txt');
  expect(result.output).toContain('__snapshots__/my-test/test-2/snapshots2/bar.txt');

  // test2, run with foo #2
  expect(result.output).toContain('test-results/my-test-test-2-foo2/bar.txt');
  expect(result.output).toContain('__snapshots__/my-test/test-2/snapshots2/bar.txt');

  // test2, run with bar
  expect(result.output).toContain('test-results/my-test-test-2-bar/bar.txt');
  expect(result.output).toContain('__snapshots__/my-test/test-2/snapshots2/bar.txt');
});

test('should remove output dirs for projects run', async ({runInlineTest}, testInfo) => {
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
      module.exports = { projects: [
        { outputDir: ${JSON.stringify(paths[0])} },
        { outputDir: ${JSON.stringify(paths[2])} },
      ] };
    `,
    'a.test.js': `
      const { test } = folio;
      test('my test', ({}, testInfo) => {});
    `
  }, { output: '' });
  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(2);

  expect(fs.existsSync(files[0])).toBe(false);
  expect(fs.existsSync(files[1])).toBe(true);
  expect(fs.existsSync(files[2])).toBe(false);
});

test('should remove folders with preserveOutput=never', async ({ runInlineTest }, testInfo) => {
  const result = await runInlineTest({
    'folio.config.ts': `
      export default { preserveOutput: 'never' };
    `,
    'dir/my-test.spec.js': `
      const { test } = folio;
      test('test 1', async ({}, testInfo) => {
        require('fs').writeFileSync(testInfo.outputPath('file.txt'), 'content', 'utf-8');
        if (testInfo.retry < 2)
          throw new Error('Give me retries');
      });
    `,
  }, { retries: 2 });
  expect(result.exitCode).toBe(0);
  expect(result.results.length).toBe(3);

  expect(fs.existsSync(testInfo.outputPath('test-results', 'dir-my-test-test-1'))).toBe(false);
  expect(fs.existsSync(testInfo.outputPath('test-results', 'dir-my-test-test-1-retry1'))).toBe(false);
  expect(fs.existsSync(testInfo.outputPath('test-results', 'dir-my-test-test-1-retry2'))).toBe(false);
});

test('should not remove folders on non-CI', async ({ runInlineTest }, testInfo) => {
  const result = await runInlineTest({
    'dir/my-test.spec.js': `
      const { test } = folio;
      test('test 1', async ({}, testInfo) => {
        require('fs').writeFileSync(testInfo.outputPath('file.txt'), 'content', 'utf-8');
        if (testInfo.retry < 2)
          throw new Error('Give me retries');
      });
    `,
  }, { 'retries': 2 }, { CI: '' });
  expect(result.exitCode).toBe(0);
  expect(result.results.length).toBe(3);

  expect(fs.existsSync(testInfo.outputPath('test-results', 'dir-my-test-test-1'))).toBe(true);
  expect(fs.existsSync(testInfo.outputPath('test-results', 'dir-my-test-test-1-retry1'))).toBe(true);
  expect(fs.existsSync(testInfo.outputPath('test-results', 'dir-my-test-test-1-retry2'))).toBe(true);
});
