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

import { fixtures } from '../../';
const { it, expect, defineTestFixture, defineWorkerFixture } = fixtures
    .declareTestFixtures<{ postProcess: string }>()
    .declareWorkerFixtures<{ config: any }>();

defineTestFixture('postProcess', async ({testInfo}, runTest) => {
  await runTest('');
  testInfo.data['myname'] = 'myvalue';
});

defineWorkerFixture('config', async ({testConfig}, runTest) => {
  await runTest(testConfig);
});

it('ensure fixture handles test error', async ({ postProcess, testConfig }) => {
  console.log('console.log');
  console.error('console.error');
  expect(testConfig.outputDir).toBeTruthy();
});
