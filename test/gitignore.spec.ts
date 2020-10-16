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

import { folio } from './fixtures';
const { it, expect } = folio;

it('should respect .gitignore', async ({runInlineTest}) => {
  const result = await runInlineTest({
    '.gitignore': `a.spec.js`,
    'a.spec.js': `
      it('pass', ({}) => {});
    `,
    'b.spec.js': `
      it('pass', ({}) => {});
    `
  });
  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(1);
});

it('should respect nested .gitignore', async ({runInlineTest}) => {
  const result = await runInlineTest({
    'a/.gitignore': `a.spec.js`,
    'a/a.spec.js': `
      it('pass', ({}) => {});
    `,
    'a/b.spec.js': `
      it('pass', ({}) => {});
    `
  });
  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(1);
});

it('should respect enclosing .gitignore', async ({runInlineTest}) => {
  const result = await runInlineTest({
    '.gitignore': `a/a.spec.js`,
    'a/a.spec.js': `
      it('pass', ({}) => {});
    `,
    'a/b.spec.js': `
      it('pass', ({}) => {});
    `
  });
  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(1);
});

it('should respect enclosing .gitignore', async ({runInlineTest}) => {
  const result = await runInlineTest({
    '.gitignore': `a/a.spec.js`,
    'a/a.spec.js': `
      it('pass', ({}) => {});
    `,
    'a/b.spec.js': `
      it('pass', ({}) => {});
    `
  });
  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(1);
});
