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
      it('succeeds', async ({ testWorkerIndex }) => {
        expect(testWorkerIndex).toBe(0);
        // First test waits for the second to start to work around the race.
        while (true) {
          if (fs.existsSync(path.join(process.env.PW_OUTPUT_DIR, 'parallel-index.txt')))
            break;
          await new Promise(f => setTimeout(f, 100));
        }
      });
    `,
    '2.spec.ts': `
      import * as fs from 'fs';
      import * as path from 'path';
      it('succeeds', async ({ testWorkerIndex }) => {
        // First test waits for the second to start to work around the race.
        fs.writeFileSync(path.join(process.env.PW_OUTPUT_DIR, 'parallel-index.txt'), 'TRUE');
        expect(testWorkerIndex).toBe(1);
      });
    `,
  });
  expect(result.passed).toBe(2);
  expect(result.exitCode).toBe(0);
});

it('should reuse worker for the same parameters', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'a.test.js': `
      const builder = baseFolio.extend();
      builder.setWorkerFixture('worker1', ({}, runTest) => runTest());
      builder.setWorkerFixture('worker2', ({}, runTest) => runTest());
      const { it } = builder.build();

      it('succeeds', async ({ worker1, testWorkerIndex }) => {
        expect(testWorkerIndex).toBe(0);
      });

      it('succeeds', async ({ worker2, testWorkerIndex }) => {
        expect(testWorkerIndex).toBe(0);
      });
    `,
  });
  expect(result.passed).toBe(2);
  expect(result.exitCode).toBe(0);
});

it('should not reuse worker for different parameters', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'a.test.js': `
      const builder = baseFolio.extend();
      builder.setParameter('param', '', '');
      builder.setWorkerFixture('worker2', ({}, runTest) => runTest());
      const { it } = builder.build();

      it('succeeds', async ({ testWorkerIndex }) => {
        expect(testWorkerIndex).toBe(0);
      });

      it('succeeds', async ({ param, testWorkerIndex }) => {
        expect(testWorkerIndex).toBe(1);
      });
    `,
  });
  expect(result.passed).toBe(2);
  expect(result.exitCode).toBe(0);
});
