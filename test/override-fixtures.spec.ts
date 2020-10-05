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

it('should respect require order', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'fixture.js': `
      exports.fixtures = baseFixtures.defineWorkerFixtures({
        fixture: ({}, runTest) => runTest('base')
      });
    `,
    'override1.js': `
      exports.fixtures = require('./fixture.js').fixtures.overrideWorkerFixtures({
        fixture: ({}, runTest) => runTest('override1')
      });
    `,
    'override2.js': `
      exports.fixtures = require('./fixture.js').fixtures.overrideWorkerFixtures({
        fixture: ({}, runTest) => runTest('override2')
      });
    `,
    'a.test.js': `
      const { fixtures } = require('./fixture.js');
      const { it } = fixtures;
      it('should pass', ({fixture}) => {
        expect(fixture).toBe('base');
      })
    `,
    'b.test.js': `
      const { fixtures } = require('./override1.js');
      const { it } = fixtures;
      it('should pass', ({fixture}) => {
        expect(fixture).toBe('override1');
      })
    `,
    'c.test.js': `
      const { fixtures } = require('./override2.js');
      const { it } = fixtures;
      it('should pass', ({fixture}) => {
        expect(fixture).toBe('override2');
      })
    `,
    'd.test.js': `
      require('./override1.js');
      const { fixtures } = require('./override2.js');
      const { it } = fixtures;
      it('should pass', ({fixture}) => {
        expect(fixture).toBe('override2');
      })
    `,
    'e.test.js': `
      require('./override2.js');
      const { fixtures } = require('./override1.js');
      const { it } = fixtures;
      it('should pass', ({fixture}) => {
        expect(fixture).toBe('override1');
      })
    `
  });
  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(5);
});
