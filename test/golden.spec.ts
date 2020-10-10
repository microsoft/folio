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
import { folio } from './fixtures';
const { it, expect } = folio;

it('should support golden', async ({runInlineTest}) => {
  const result = await runInlineTest({
    '__snapshots__/a/is-a-test/snapshot.txt': `Hello world`,
    'a.spec.js': `
      it('is a test', ({}) => {
        expect('Hello world').toMatchSnapshot();
      });
    `
  });
  expect(result.exitCode).toBe(0);
});

it('should fail on wrong golden', async ({runInlineTest}) => {
  const result = await runInlineTest({
    '__snapshots__/a/is-a-test/snapshot.txt': `Line1
Line2
Line3
Hello world line1
Line5
Line6
Line7`,
    'a.spec.js': `
      it('is a test', ({}) => {
        const data = [];
        data.push('Line1');
        data.push('Line22');
        data.push('Line3');
        data.push('Hi world line2');
        data.push('Line5');
        data.push('Line6');
        data.push('Line7');
        expect(data.join('\\n')).toMatchSnapshot();
      });
    `
  });
  expect(result.exitCode).toBe(1);
  expect(result.output).toContain('Line1');
  expect(result.output).toContain('Line2' + colors.green('2'));
  expect(result.output).toContain('line' + colors.strikethrough(colors.red('1')) + colors.green('2'));
  expect(result.output).toContain('Line3');
  expect(result.output).toContain('Line5');
  expect(result.output).toContain('Line7');
});

it('should write missing expectations', async ({runInlineTest, testInfo}) => {
  const result = await runInlineTest({
    'a.spec.js': `
      it('is a test', ({}) => {
        expect('Hello world').toMatchSnapshot();
      });
    `
  });
  expect(result.exitCode).toBe(1);
  expect(result.output).toContain('snapshot.txt is missing in golden results, writing actual');
  const data = fs.readFileSync(testInfo.outputPath('__snapshots__/a/is-a-test/snapshot.txt'));
  expect(data.toString()).toBe('Hello world');
});

it('should update expectations', async ({runInlineTest, testInfo}) => {
  const result = await runInlineTest({
    '__snapshots__/a/is-a-test/snapshot.txt': `Hello world`,
    'a.spec.js': `
      it('is a test', ({}) => {
        expect('Hello world updated').toMatchSnapshot();
      });
    `
  }, { 'update-snapshots': true });
  expect(result.exitCode).toBe(0);
  expect(result.output).toContain('Updating snapshot at');
  expect(result.output).toContain('snapshot.txt');
  const data = fs.readFileSync(testInfo.outputPath('__snapshots__/a/is-a-test/snapshot.txt'));
  expect(data.toString()).toBe('Hello world updated');
});

it('should match multiple snapshots', async ({runInlineTest}) => {
  const result = await runInlineTest({
    '__snapshots__/a/is-a-test/snapshot.txt': `Snapshot1`,
    '__snapshots__/a/is-a-test/snapshot_1.txt': `Snapshot2`,
    '__snapshots__/a/is-a-test/snapshot_2.txt': `Snapshot3`,
    'a.spec.js': `
      it('is a test', ({}) => {
        expect('Snapshot1').toMatchSnapshot();
        expect('Snapshot2').toMatchSnapshot();
        expect('Snapshot3').toMatchSnapshot();
      });
    `
  });
  expect(result.exitCode).toBe(0);
});

it('should use provided name', async ({runInlineTest}) => {
  const result = await runInlineTest({
    '__snapshots__/a/is-a-test/provided.txt': `Hello world`,
    'a.spec.js': `
      it('is a test', ({}) => {
        expect('Hello world').toMatchSnapshot('provided.txt');
      });
    `
  });
  expect(result.exitCode).toBe(0);
});

it('should use provided name via options', async ({runInlineTest}) => {
  const result = await runInlineTest({
    '__snapshots__/a/is-a-test/provided.txt': `Hello world`,
    'a.spec.js': `
      it('is a test', ({}) => {
        expect('Hello world').toMatchSnapshot({ name: 'provided.txt' });
      });
    `
  });
  expect(result.exitCode).toBe(0);
});

it('should compare binary', async ({runInlineTest}) => {
  const result = await runInlineTest({
    '__snapshots__/a/is-a-test/snapshot.dat': Buffer.from([1,2,3,4]),
    'a.spec.js': `
      it('is a test', ({}) => {
        expect(Buffer.from([1,2,3,4])).toMatchSnapshot();
      });
    `
  });
  expect(result.exitCode).toBe(0);
});

it('should compare PNG images', async ({runInlineTest}) => {
  const result = await runInlineTest({
    '__snapshots__/a/is-a-test/snapshot.png':
        Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P+/HgAFhAJ/wlseKgAAAABJRU5ErkJggg==', 'base64'),
    'a.spec.js': `
      it('is a test', ({}) => {
        expect(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P+/HgAFhAJ/wlseKgAAAABJRU5ErkJggg==', 'base64')).toMatchSnapshot();
      });
    `
  });
  expect(result.exitCode).toBe(0);
});

it('should compare different PNG images', async ({runInlineTest}) => {
  const result = await runInlineTest({
    '__snapshots__/a/is-a-test/snapshot.png':
        Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P+/HgAFhAJ/wlseKgAAAABJRU5ErkJggg==', 'base64'),
    'a.spec.js': `
      it('is a test', ({}) => {
        expect(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVQYV2NgYAAAAAMAAWgmWQ0AAAAASUVORK5CYII==', 'base64')).toMatchSnapshot();
      });
    `
  });
  expect(result.exitCode).toBe(1);
  expect(result.output).toContain('Snapshot comparison failed');
  expect(result.output).toContain('snapshot-diff.png');
});
