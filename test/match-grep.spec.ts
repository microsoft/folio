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

import { folio } from './fixtures';
const { it, expect } = folio;

it('should grep test name', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'match-grep/a.test.ts': `
      it('test A', () => {
        expect(1 + 1).toBe(2);
      });

      it('test B', () => {
        expect(1 + 1).toBe(2);
      });

      it('test C', () => {
        expect(1 + 1).toBe(2);
      });
    `,
    'match-grep/b.test.ts': `
      it('test A', () => {
        expect(1 + 1).toBe(2);
      });

      it('test B', () => {
        expect(1 + 1).toBe(2);
      });

      it('test C', () => {
        expect(1 + 1).toBe(2);
      });
    `,
    'match-grep/c.test.ts': `
      it('test A', () => {
        expect(1 + 1).toBe(2);
      });

      it('test B', () => {
        expect(1 + 1).toBe(2);
      });

      it('test C', () => {
        expect(1 + 1).toBe(2);
      });
    `,
  }, { 'grep': 'test [A-B]' });
  expect(result.passed).toBe(6);
  expect(result.exitCode).toBe(0);
});
