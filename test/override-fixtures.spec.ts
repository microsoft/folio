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

it('should respect require order', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'fixture.js': `
      const builder = baseFolio.extend();
      builder.setWorkerFixture('fixture', ({}, runTest) => runTest('base'));
      exports.folio = builder.build();
    `,
    'override1.js': `
      const builder = require('./fixture.js').folio.extend();
      builder.overrideWorkerFixture('fixture', ({}, runTest) => runTest('override1'));
      exports.folio = builder.build();
    `,
    'override2.js': `
      const builder = require('./fixture.js').folio.extend();
      builder.overrideWorkerFixture('fixture', ({}, runTest) => runTest('override2'));
      exports.folio = builder.build();
    `,
    'a.test.js': `
      const { folio } = require('./fixture.js');
      const { it } = folio;
      it('should pass', ({fixture}) => {
        expect(fixture).toBe('base');
      })
    `,
    'b.test.js': `
      const { folio } = require('./override1.js');
      const { it } = folio;
      it('should pass', ({fixture}) => {
        expect(fixture).toBe('override1');
      })
    `,
    'c.test.js': `
      const { folio } = require('./override2.js');
      const { it } = folio;
      it('should pass', ({fixture}) => {
        expect(fixture).toBe('override2');
      })
    `,
    'd.test.js': `
      require('./override1.js');
      const { folio } = require('./override2.js');
      const { it } = folio;
      it('should pass', ({fixture}) => {
        expect(fixture).toBe('override2');
      })
    `,
    'e.test.js': `
      require('./override2.js');
      const { folio } = require('./override1.js');
      const { it } = folio;
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
      const builder = baseFolio.extend();
      builder.setWorkerFixture('fixture', ({}, runTest) => runTest('base'));
      module.exports = builder.build();
    `,
    'override1.js': `
      module.exports = fixtures => {
        const builder = fixtures.extend();
        builder.overrideWorkerFixture('fixture', ({}, runTest) => runTest('override1'));
        return builder.build();
      };
    `,
    'override2.js': `
      module.exports = fixtures => {
        const builder = fixtures.extend();
        builder.overrideWorkerFixture('fixture', ({}, runTest) => runTest('override2'));
        return builder.build();
      };
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
      const baseBuilder = baseFolio.extend();
      baseBuilder.setTestFixture('foo', ({}, runTest) => runTest('base'));
      const base = baseBuilder.build();

      const fixtures1Builder = base.extend();
      fixtures1Builder.setTestFixture('bar', ({}, runTest) => runTest('bar'));
      const fixtures1 = fixtures1Builder.build();

      const fixtures2Builder = base.extend();
      fixtures2Builder.overrideTestFixture('foo', ({}, runTest) => runTest('override'));
      const fixtures2 = fixtures2Builder.build();

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

      const builder = fixtures2.union(fixtures1).extend();
      builder.overrideTestFixture('foo', ({}, runTest) => runTest('local'));
      builder.build().it('test3', ({ foo, bar }) => {
        expect(foo).toBe('local');
        expect(bar).toBe('bar');
      });
    `,
  });
  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(3);
});
