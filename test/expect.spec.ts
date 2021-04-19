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

test('should be able to extend the expect matchers with test.extend in the folio config', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'folio.config.ts': `
      folio.setConfig({ timeout: 30000 });

      export const test = folio.newTestType()

      folio.expect.extend({
        toBeWithinRange(received, floor, ceiling) {
          const pass = received >= floor && received <= ceiling;
          if (pass) {
            return {
              message: () =>
                'passed',
              pass: true,
            };
          } else {
            return {
              message: () => 'failed',
              pass: false,
            };
          }
        },
      });

      test.runWith();
    `,
    'expect-test.spec.ts': `
      import { test } from './folio.config';
      test('numeric ranges', () => {
        test.expect(100).toBeWithinRange(90, 110);
        test.expect(101).not.toBeWithinRange(0, 100);
      });
    `
  });
  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(1);
});

test('should work with default expect prototype functions', async ({runTSC}) => {
  const result = await runTSC({
    'a.spec.ts': `
      const expected = [1, 2, 3, 4, 5, 6];
      test.expect([4, 1, 6, 7, 3, 5, 2, 5, 4, 6]).toEqual(
        expect.arrayContaining(expected),
      );
    `
  });
  expect(result.exitCode).toBe(0);
});

test('should work with default expect matchers', async ({runTSC}) => {
  const result = await runTSC({
    'a.spec.ts': `
      test.expect(42).toBe(42);
    `
  });
  expect(result.exitCode).toBe(0);
});

test('should work with jest-community/jest-extended', async ({runTSC}) => {
  const result = await runTSC({
    'global.d.ts': `
      // Extracted example from their typings.
      // Reference: https://github.com/jest-community/jest-extended/blob/master/types/index.d.ts
      declare namespace jest {
        interface Matchers<R> {
          toBeEmpty(): R;
        }
      }
    `,
    'a.spec.ts': `
      test.expect('').toBeEmpty();
      test.expect('hello').not.toBeEmpty();
      test.expect([]).toBeEmpty();
      test.expect(['hello']).not.toBeEmpty();
      test.expect({}).toBeEmpty();
      test.expect({ hello: 'world' }).not.toBeEmpty();
    `
  });
  expect(result.exitCode).toBe(0);
});

test('should work with custom folio namespace', async ({runTSC}) => {
  const result = await runTSC({
    'global.d.ts': `
      // Extracted example from their typings.
      // Reference: https://github.com/jest-community/jest-extended/blob/master/types/index.d.ts
      declare namespace folio {
        interface Matchers<R> {
          toBeEmpty(): R;
        }
      }
    `,
    'a.spec.ts': `
      test.expect.extend({
        toBeWithinRange() { },
      });

      test.expect('').toBeEmpty();
      test.expect('hello').not.toBeEmpty();
      test.expect([]).toBeEmpty();
      test.expect(['hello']).not.toBeEmpty();
      test.expect({}).toBeEmpty();
      test.expect({ hello: 'world' }).not.toBeEmpty();
    `
  });
  expect(result.exitCode).toBe(0);
});