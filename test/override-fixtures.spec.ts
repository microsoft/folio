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

import { fixtures } from './fixtures';
const { it, expect } = fixtures;

it('should respect require order', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'fixture.js': `
      fixtures.defineWorkerFixture('fixture', ({}, runTest) => runTest('base'));
    `,
    'override1.js': `
      require('./fixture.js');
      fixtures.overrideWorkerFixture('fixture', ({}, runTest) => runTest('override1'));
    `,
    'override2.js': `
      require('./fixture.js');
      fixtures.overrideWorkerFixture('fixture', ({}, runTest) => runTest('override2'));
    `,
    'a.test.js': `
      require('./fixture.js');
      it('should pass', ({fixture}) => {
        expect(fixture).toBe('base');
      })
    `,
    'b.test.js': `
      require('./override1.js');
      it('should pass', ({fixture}) => {
        expect(fixture).toBe('override1');
      })
    `,
    'c.test.js': `
      require('./override2.js');
      it('should pass', ({fixture}) => {
        expect(fixture).toBe('override2');
      })
    `,
    'd.test.js': `
      require('./override1.js');
      require('./override2.js');
      it('should pass', ({fixture}) => {
        expect(fixture).toBe('override2');
      })
    `,
    'e.test.js': `
      require('./override2.js');
      require('./override1.js');
      it('should pass', ({fixture}) => {
        expect(fixture).toBe('override1');
      })
    `
  });
  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(5);
});
