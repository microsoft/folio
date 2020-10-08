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

it('should respect override order 2', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'fixture.js': `
      module.exports = baseFixtures.defineWorkerFixtures({
        fixture: ({}, runTest) => runTest('base')
      });
    `,
    'override1.js': `
      module.exports = fixtures => fixtures.overrideWorkerFixtures({
        fixture: ({}, runTest) => runTest('override1')
      });
    `,
    'override2.js': `
      module.exports = fixtures => fixtures.overrideWorkerFixtures({
        fixture: ({}, runTest) => runTest('override2')
      });
    `,
    'a.test.js': `
      const base = require('./fixture.js');
      const wrap1 = require('./override1.js');
      const wrap2 = require('./override2.js');
      const { it } = wrap2(wrap1(base));
      it('should pass', ({fixture}) => {
        expect(fixture).toBe('override2');
      });
    `,
    'b.test.js': `
      const base = require('./fixture.js');
      const wrap1 = require('./override1.js');
      const wrap2 = require('./override2.js');
      const { it } = wrap1(wrap2(base));
      it('should pass', ({fixture}) => {
        expect(fixture).toBe('override1');
      });
    `,
    'c.test.js': `
      const base = require('./fixture.js');
      const wrap1 = require('./override1.js');
      const wrap2 = require('./override2.js');
      const { it } = base;
      it('should pass', ({fixture}) => {
        expect(fixture).toBe('base');
      });
    `,
    'd.test.js': `
      const base = require('./fixture.js');
      const wrap1 = require('./override1.js');
      const wrap2 = require('./override2.js');
      const { it } = wrap1(base);
      it('should pass', ({fixture}) => {
        expect(fixture).toBe('override1');
      });
    `,
    'e.test.js': `
      const base = require('./fixture.js');
      const wrap1 = require('./override1.js');
      const wrap2 = require('./override2.js');
      const { it } = wrap2(base);
      it('should pass', ({fixture}) => {
        expect(fixture).toBe('override2');
      });
    `
  });
  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(5);
});

it('should allow overrides in union', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'fixtures.js': `
      const base = baseFixtures.defineTestFixtures({
        foo: async ({}, runTest) => { await runTest('base') }
      });
      const fixtures1 = base.defineTestFixtures({
        bar: async ({}, runTest) => { await runTest('bar') }
      });
      const fixtures2 = base.overrideTestFixtures({
        foo: async ({}, runTest) => { await runTest('override') }
      });
      module.exports = { fixtures1, fixtures2 };
    `,
    'a.test.js': `
      const { fixtures1, fixtures2 } = require('./fixtures.js');
      fixtures1.union(fixtures2).it('test1', ({ foo, bar }) => {
        expect(foo).toBe('override');
        expect(bar).toBe('bar');
      });
      fixtures2.union(fixtures1).it('test2', ({ foo, bar }) => {
        expect(foo).toBe('override');
        expect(bar).toBe('bar');
      });
      fixtures2.union(fixtures1).overrideTestFixtures({
        foo: async ({}, runTest) => { await runTest('local') }
      }).it('test3', ({ foo, bar }) => {
        expect(foo).toBe('local');
        expect(bar).toBe('bar');
      });
    `,
  });
  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(3);
});
