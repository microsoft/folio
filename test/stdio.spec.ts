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

it('should get top level stdio', async ({runTest}) => {
  const result = await runTest('log-something.js');
  expect(result.output.split('\n').filter(x => x.startsWith('%%'))).toEqual([
    '%% top level stdout',
    '%% top level stderr',
    '%% top level stdout', // top level logs appear twice, because the file is required twice
    '%% top level stderr',
    '%% stdout in a test',
    '%% stderr in a test'
  ]);
});
