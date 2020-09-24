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

import { fixtures } from '../../..';
const { it, expect } = fixtures;
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
