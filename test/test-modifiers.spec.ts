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

test('test modifiers should work', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'folio.config.ts': `
      export const test = folio.test.extend({
        beforeAll() {
          return { foo: true };
        }
      });
      test.runWith();
    `,
    'a.test.ts': `
      import { test } from './folio.config';

      test('passed1', async ({foo}) => {
      });
      test('passed2', async ({foo}) => {
        test.skip(false);
      });
      test('passed3', async ({foo}) => {
        test.skip(({foo}) => !foo, 'reason');
      });

      test('skipped1', async ({foo}) => {
        test.skip();
      });
      test('skipped2', async ({foo}) => {
        test.skip('reason');
      });
      test('skipped3', async ({foo}) => {
        test.skip(foo);
      });
      test('skipped4', async ({foo}) => {
        test.skip(foo, 'reason');
      });
      test('skipped5', async ({foo}) => {
        test.skip(() => true);
      });
      test('skipped6', async ({foo}) => {
        test.skip(({ foo }) => foo, 'reason');
      });

      test('failed1', async ({foo}) => {
        test.fail();
        expect(true).toBe(false);
      });
      test('failed2', async ({foo}) => {
        test.fail('reason');
        expect(true).toBe(false);
      });
      test('failed3', async ({foo}) => {
        test.fail(foo);
        expect(true).toBe(false);
      });
      test('failed4', async ({foo}) => {
        test.fail(foo, 'reason');
        expect(true).toBe(false);
      });
      test('failed5', async ({foo}) => {
        test.fail(() => true);
        expect(true).toBe(false);
      });
      test('failed6', async ({foo}) => {
        test.fail(({ foo }) => foo, 'reason');
        expect(true).toBe(false);
      });

      test.describe('suite1', () => {
        test.skip();
        test('suite1', () => {});
      });

      test.describe('suite2', () => {
        test.skip(true);
        test('suite2', () => {});
      });

      test.describe('suite3', () => {
        test.skip(({ foo }) => foo, 'reason');
        test('suite3', () => {});
      });

      test.describe('suite3', () => {
        test.skip(({ foo }) => !foo, 'reason');
        test('suite4', () => {});
      });
    `,
  });

  const expectTest = (title: string, expectedStatus: string, status: string, annotations: any) => {
    const spec = result.report.suites[0].specs.find(s => s.title === title) ||
        result.report.suites[0].suites.find(s => s.specs[0].title === title).specs[0];
    const test = spec.tests[0];
    expect(test.expectedStatus).toBe(expectedStatus);
    expect(test.results[0].status).toBe(status);
    expect(test.annotations).toEqual(annotations);
  };
  expectTest('passed1', 'passed', 'passed', []);
  expectTest('passed2', 'passed', 'passed', []);
  expectTest('passed3', 'passed', 'passed', []);
  expectTest('skipped1', 'skipped', 'skipped', [{ type: 'skip' }]);
  expectTest('skipped2', 'skipped', 'skipped', [{ type: 'skip', description: 'reason' }]);
  expectTest('skipped3', 'skipped', 'skipped', [{ type: 'skip' }]);
  expectTest('skipped4', 'skipped', 'skipped', [{ type: 'skip', description: 'reason' }]);
  expectTest('skipped5', 'skipped', 'skipped', [{ type: 'skip' }]);
  expectTest('skipped6', 'skipped', 'skipped', [{ type: 'skip', description: 'reason' }]);
  expectTest('failed1', 'failed', 'failed', [{ type: 'fail' }]);
  expectTest('failed2', 'failed', 'failed', [{ type: 'fail', description: 'reason' }]);
  expectTest('failed3', 'failed', 'failed', [{ type: 'fail' }]);
  expectTest('failed4', 'failed', 'failed', [{ type: 'fail', description: 'reason' }]);
  expectTest('failed5', 'failed', 'failed', [{ type: 'fail' }]);
  expectTest('failed6', 'failed', 'failed', [{ type: 'fail', description: 'reason' }]);
  expectTest('suite1', 'skipped', 'skipped', [{ type: 'skip' }]);
  expectTest('suite2', 'skipped', 'skipped', [{ type: 'skip' }]);
  expectTest('suite3', 'skipped', 'skipped', [{ type: 'skip', description: 'reason' }]);
  expectTest('suite4', 'passed', 'passed', []);
  expect(result.passed).toBe(10);
  expect(result.skipped).toBe(9);
});

test('test modifiers should check types', async ({runTSC}) => {
  const result = await runTSC({
    'folio.config.ts': `
      export const test = folio.test.extend({
        beforeAll() {
          return { foo: true };
        }
      });
      test.runWith();
    `,
    'a.test.ts': `
      import { test } from './folio.config';

      test('passed1', async ({foo}) => {
        test.skip();
      });
      test('passed2', async ({foo}) => {
        test.skip(foo);
      });
      test('passed2', async ({foo}) => {
        test.skip(foo, 'reason');
      });
      test('passed3', async ({foo}) => {
        test.skip(({foo}) => foo);
      });
      test('passed3', async ({foo}) => {
        test.skip(({foo}) => foo, 'reason');
      });
      test('passed3', async ({foo}) => {
        // @ts-expect-error
        test.skip('foo', 'bar');
      });
      test('passed3', async ({foo}) => {
        // @ts-expect-error
        test.skip(({ bar }) => bar, 'reason');
      });
      test('passed3', async ({foo}) => {
        // @ts-expect-error
        test.skip(42);
      });
    `,
  });
  expect(result.exitCode).toBe(0);
});
