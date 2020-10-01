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
import { fixtures } from './fixtures';
const { it, expect } = fixtures;

it('max-failures should work', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'a.spec.js': `
      for (let i = 0; i < 10; ++i) {
        it('fail_' + i, () => {
          expect(true).toBe(false);
        });
      }
    `,
    'b.spec.js': `
      for (let i = 0; i < 10; ++i) {
        it('fail_' + i, () => {
          expect(true).toBe(false);
        });
      }
    `
  }, { 'max-failures': 8 });
  expect(result.exitCode).toBe(1);
  expect(result.failed).toBe(8);
  expect(result.output.split('\n').filter(l => l.includes('expect(')).length).toBe(16);
});

it('-x should work', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'a.spec.js': `
      for (let i = 0; i < 10; ++i) {
        it('fail_' + i, () => {
          expect(true).toBe(false);
        });
      }
    `,
    'b.spec.js': `
      for (let i = 0; i < 10; ++i) {
        it('fail_' + i, () => {
          expect(true).toBe(false);
        });
      }
    `
  }, { '-x': true });
  expect(result.exitCode).toBe(1);
  expect(result.failed).toBe(1);
  expect(result.output.split('\n').filter(l => l.includes('expect(')).length).toBe(2);
});
