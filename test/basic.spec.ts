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

it('should fail', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'one-failure.spec.ts': `
      it('fails', () => {
        expect(1 + 1).toBe(7);
      });
    `
  });
  expect(result.exitCode).toBe(1);
  expect(result.passed).toBe(0);
  expect(result.failed).toBe(1);
  expect(result.output).toContain('1) one-failure.spec.ts:5');
});

it('should timeout', async ({ runInlineTest }) => {
  const { exitCode, passed, failed, output } = await runInlineTest({
    'one-timeout.spec.js': `
      it('timeout', async () => {
        await new Promise(f => setTimeout(f, 10000));
      });
    `
  }, { timeout: 100 });
  expect(exitCode).toBe(1);
  expect(passed).toBe(0);
  expect(failed).toBe(1);
  expect(output).toContain('Timeout of 100ms exceeded.');
});

it('should succeed', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'one-success.spec.js': `
      it('succeeds', () => {
        expect(1 + 1).toBe(2);
      });
    `
  });
  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(1);
  expect(result.failed).toBe(0);
});

it('should report suite errors', async ({ runInlineTest }) => {
  const { exitCode, failed, output } = await runInlineTest({
    'suite-error.spec.js': `
      if (new Error().stack.includes('workerRunner'))
        throw new Error('Suite error');

      it('passes',() => {
        expect(1 + 1).toBe(2);
      });
    `
  });
  expect(exitCode).toBe(1);
  expect(failed).toBe(1);
  expect(output).toContain('Suite error');
});

it('should respect nested skip', async ({ runInlineTest }) => {
  const { exitCode, passed, failed, skipped } = await runInlineTest({
    'nested-skip.spec.js': `
      describe('skipped', suite => {
        suite.skip(true);
      }, () => {
        it('succeeds',() => {
          expect(1 + 1).toBe(2);
        });
      });
    `
  });
  expect(exitCode).toBe(0);
  expect(passed).toBe(0);
  expect(failed).toBe(0);
  expect(skipped).toBe(1);
});

it('should respect slow test', async ({ runInlineTest }) => {
  const { exitCode, output } = await runInlineTest({
    'slow.spec.js': `
      it('slow', test => {
        test.slow();
      }, async () => {
        await new Promise(f => setTimeout(f, 10000));
      });
    `
  }, { timeout: 1 });
  expect(output).toContain('Timeout of 3ms exceeded');
  expect(exitCode).toBe(1);
});

it('should respect excluded tests', async ({ runInlineTest }) => {
  const { exitCode, passed } = await runInlineTest({
    'excluded.spec.ts': `
      it('included test', () => {
        expect(1 + 1).toBe(2);
      });

      xit('excluded test', () => {
        expect(1 + 1).toBe(3);
      });

      it.skip('excluded test', () => {
        expect(1 + 1).toBe(3);
      });

      describe('included describe', () => {
        it('included describe test', () => {
          expect(1 + 1).toBe(2);
        });
      });

      describe.skip('excluded describe', () => {
        it('excluded describe test', () => {
          expect(1 + 1).toBe(3);
        });
      });
    `,
  });
  expect(passed).toBe(2);
  expect(exitCode).toBe(0);
});

it('should respect focused tests', async ({ runInlineTest }) => {
  const { exitCode, passed } = await runInlineTest({
    'focused.spec.ts': `
      it('included test', () => {
        expect(1 + 1).toBe(3);
      });

      fit('focused test', () => {
        expect(1 + 1).toBe(2);
      });

      it.only('focused only test', () => {
        expect(1 + 1).toBe(2);
      });

      describe.only('focused describe', () => {
        it('describe test', () => {
          expect(1 + 1).toBe(2);
        });
      });

      describe('non-focused describe', () => {
        it('describe test', () => {
          expect(1 + 1).toBe(3);
        });
      });

      describe.only('focused describe', () => {
        it('test1', () => {
          expect(1 + 1).toBe(2);
        });
        it.only('test2', () => {
          expect(1 + 1).toBe(2);
        });
        it('test3', () => {
          expect(1 + 1).toBe(2);
        });
        it.only('test4', () => {
          expect(1 + 1).toBe(2);
        });
      });
    `
  });
  expect(passed).toBe(5);
  expect(exitCode).toBe(0);
});

it('should accept a single filename', async ({runInlineTest}) => {
  const { passed } = await runInlineTest({
    'test.spec.js': `
      it('should work', async () => {
        expect(1).toBe(1);
      });
    `
  }, { testDir: 'test.spec.js' });
  expect(passed).toBe(1);
});
