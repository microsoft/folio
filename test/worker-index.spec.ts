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

it('should run in parallel', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    '1.spec.ts': `
      import * as fs from 'fs';
      import * as path from 'path';
      test('succeeds', async ({ testWorkerIndex }) => {
        expect(testWorkerIndex).toBe(0);
        // First test waits for the second to start to work around the race.
        while (true) {
          if (fs.existsSync(path.join(config.outputDir, 'parallel-index.txt')))
            break;
          await new Promise(f => setTimeout(f, 100));
        }
      });
    `,
    '2.spec.ts': `
      import * as fs from 'fs';
      import * as path from 'path';
      test('succeeds', async ({ testWorkerIndex }) => {
        // First test waits for the second to start to work around the race.
        fs.mkdirSync(config.outputDir, { recursive: true });
        fs.writeFileSync(path.join(config.outputDir, 'parallel-index.txt'), 'TRUE');
        expect(testWorkerIndex).toBe(1);
      });
    `,
  });
  expect(result.passed).toBe(2);
  expect(result.exitCode).toBe(0);
});

it('should reuse worker for the same parameters', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'fixtures.ts': `
      async function worker1({}, runTest) {
        await runTest();
      }

      async function worker2({}, runTest) {
        await runTest();
      }

      export const toBeRenamed = { workerFixtures: { worker1, worker2 } };
    `,
    'a.test.js': `
      test('succeeds', async ({ worker1, testWorkerIndex }) => {
        expect(testWorkerIndex).toBe(0);
      });

      test('succeeds', async ({ worker2, testWorkerIndex }) => {
        expect(testWorkerIndex).toBe(0);
      });

      const test2 = createTest();
      test2('succeeds', async ({ worker2, testWorkerIndex }) => {
        expect(testWorkerIndex).toBe(0);
      });
    `,
  });
  expect(result.passed).toBe(3);
  expect(result.exitCode).toBe(0);
});
