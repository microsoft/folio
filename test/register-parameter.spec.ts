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

it('should allow custom parameters', async ({ runTest }) => {
  const result = await runTest('register-parameter.ts', {
    'param': 'param1=value1',
  });
  expect(result.exitCode).toBe(0);
});

it('should fail on unknown parameters', async ({ runTest }) => {
  const result = await runTest('register-parameter.ts', {
    'param': ['param1=value1', 'param3=value3']
  }).catch(e => e);
  expect(result.output).toContain(`unknown parameter 'param3'`);
});

it('should locally override parameters', async ({ runTest }) => {
  const result = await runTest('local-parameter-override.ts', {
    'param': ['param2=override from outside 2']
  });
  expect(result.exitCode).toBe(0);
});
