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

test('should be able to redefine config', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'folio.config.ts': `
      folio.setConfig({ timeout: 12345 });
      export const test = folio.test;
      test.runWith();
    `,
    'a.test.ts': `
      import { test } from './folio.config';
      test('pass', async ({}, testInfo) => {
        expect(testInfo.timeout).toBe(12345);
      });
    `
  });

  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(1);
});

test('should read config from --config', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'my.config.ts': `
      import * as path from 'path';
      folio.setConfig({
        testDir: path.join(__dirname, 'dir'),
      });
      export const test = folio.test;
      test.runWith();
    `,
    'a.test.ts': `
      import { test } from './my.config';
      test('ignored', async ({}) => {
      });
    `,
    'dir/b.test.ts': `
      import { test } from '../my.config';
      test('run', async ({}) => {
      });
    `,
  }, { config: 'my.config.ts' });

  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(1);
  expect(result.report.suites.length).toBe(1);
  expect(result.report.suites[0].file).toBe('b.test.ts');
});

test('should default testDir to the config file', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'dir/my.config.ts': `
      export const test = folio.test;
      test.runWith();
    `,
    'a.test.ts': `
      import { test } from './dir/my.config';
      test('ignored', async ({}) => {
      });
    `,
    'dir/b.test.ts': `
      import { test } from './my.config';
      test('run', async ({}) => {
      });
    `,
  }, { config: path.join('dir', 'my.config.ts') });

  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(1);
  expect(result.report.suites.length).toBe(1);
  expect(result.report.suites[0].file).toBe('b.test.ts');
});

test('should be able to setReporters', async ({ runInlineTest }, testInfo) => {
  const reportFile = testInfo.outputPath('my-report.json');
  const result = await runInlineTest({
    'folio.config.ts': `
      folio.setReporters([
        new folio.reporters.json({ outputFile: ${JSON.stringify(reportFile)}}),
        new folio.reporters.list(),
      ]);
      export const test = folio.test;
      test.runWith();
    `,
    'a.test.ts': `
      import { test } from './folio.config';
      test('pass', async () => {
      });
    `
  }, { reporter: '' });
  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(1);
  const report = JSON.parse(fs.readFileSync(reportFile).toString());
  expect(report.suites[0].file).toBe('a.test.ts');
});
