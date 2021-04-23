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

test('should work and remove empty dir', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'my-test.spec.js': `
      test('test 1', async ({}, testInfo) => {
        if (testInfo.retry) {
          expect(testInfo.outputDir).toContain(require('path').join('my-test', 'test-1-retry1'));
          expect(testInfo.outputPath('foo', 'bar')).toContain(require('path').join('my-test', 'test-1-retry1', 'foo', 'bar'));
        } else {
          expect(testInfo.outputDir).toContain(require('path').join('my-test', 'test-1'));
          expect(testInfo.outputPath()).toContain(require('path').join('my-test', 'test-1'));
          expect(testInfo.outputPath('foo', 'bar')).toContain(require('path').join('my-test', 'test-1', 'foo', 'bar'));
        }
        expect(require('fs').existsSync(testInfo.outputDir)).toBe(true);
        if (testInfo.retry !== 1)
          throw new Error('Give me a retry');
      });
    `,
  }, { retries: 1 });
  expect(result.exitCode).toBe(0);

  expect(result.results[0].status).toBe('failed');
  expect(result.results[0].retry).toBe(0);
  // Should only fail the last retry check.
  expect(result.results[0].error.message).toBe('Give me a retry');

  expect(result.results[1].status).toBe('passed');
  expect(result.results[1].retry).toBe(1);
});

test('should include runWith tag', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'folio.config.ts': `
      class Env {
        constructor(snapshotPathSegment) {
          this._snapshotPathSegment = snapshotPathSegment;
        }
        async beforeEach(args, testInfo) {
          testInfo.snapshotPathSegment = this._snapshotPathSegment;
          return {};
        }
      }
      export const test = folio.test.extend();
      export const test2 = folio.test.extend();
      test.runWith(new Env('snapshots1'), { tag: 'foo' });
      test.runWith(new Env('snapshots2'), { tag: 'foo' });
      test2.runWith(new Env('snapshots1'), { tag: 'foo' });
      test2.runWith(new Env('snapshots1'), { tag: ['a', 'b'] });
    `,
    'my-test.spec.js': `
      const { test, test2 } = require('./folio.config');
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

  // test1, run with first env
  expect(result.output).toContain('test-results/my-test/test-1-foo1/bar.txt');
  expect(result.output).toContain('__snapshots__/my-test/test-1/snapshots1/bar.txt');
  expect(result.output).toContain('test-results/my-test/test-1-foo1-retry1/bar.txt');
  expect(result.output).toContain('__snapshots__/my-test/test-1/snapshots1/bar.txt');

  // test1, run with second env
  expect(result.output).toContain('test-results/my-test/test-1-foo2/bar.txt');
  expect(result.output).toContain('__snapshots__/my-test/test-1/snapshots2/bar.txt');
  expect(result.output).toContain('test-results/my-test/test-1-foo2-retry1/bar.txt');
  expect(result.output).toContain('__snapshots__/my-test/test-1/snapshots2/bar.txt');

  // test2, run with env and tag=foo
  expect(result.output).toContain('test-results/my-test/test-2-foo/bar.txt');
  expect(result.output).toContain('__snapshots__/my-test/test-2/snapshots1/bar.txt');

  // test2, run with env and tag=a,b
  expect(result.output).toContain('test-results/my-test/test-2-a-b/bar.txt');
  expect(result.output).toContain('__snapshots__/my-test/test-2/snapshots1/bar.txt');
});
