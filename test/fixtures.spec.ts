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
import { firstStackFrame, folio, stripAscii } from './fixtures';
const { it, expect } = folio;

it('should work', async ({ runInlineFixturesTest }) => {
  const { results } = await runInlineFixturesTest({
    'a.test.js': `
      const builder = baseFolio.extend();
      builder.asdf.init(async ({}, test) => await test(123));
      const { it } = builder.build();
      it('should use asdf', async ({asdf}) => {
        expect(asdf).toBe(123);
      });
    `,
  });
  expect(results[0].status).toBe('passed');
});

it('should work with a sync function', async ({ runInlineFixturesTest }) => {
  const { results } = await runInlineFixturesTest({
    'a.test.js': `
      const builder = baseFolio.extend();
      builder.asdf.init(async ({}, test) => await test(123));
      const { it } = builder.build();
      it('should use asdf', ({asdf}) => {
        expect(asdf).toBe(123);
      });
    `,
  });
  expect(results[0].status).toBe('passed');
});

it('should work with a non-arrow function', async ({ runInlineFixturesTest }) => {
  const { results } = await runInlineFixturesTest({
    'a.test.js': `
      const builder = baseFolio.extend();
      builder.asdf.init(async ({}, test) => await test(123));
      const { it } = builder.build();
      it('should use asdf', function ({asdf}) {
        expect(asdf).toBe(123);
      });
    `,
  });
  expect(results[0].status).toBe('passed');
});

it('should work with a named function', async ({ runInlineFixturesTest }) => {
  const { results } = await runInlineFixturesTest({
    'a.test.js': `
      const builder = baseFolio.extend();
      builder.asdf.init(async ({}, test) => await test(123));
      const { it } = builder.build();
      it('should use asdf', async function hello({asdf}) {
        expect(asdf).toBe(123);
      });
    `,
  });
  expect(results[0].status).toBe('passed');
});

it('should work with renamed parameters', async ({ runInlineFixturesTest }) => {
  const { results } = await runInlineFixturesTest({
    'a.test.js': `
      const builder = baseFolio.extend();
      builder.asdf.init(async ({}, test) => await test(123));
      const { it } = builder.build();
      it('should use asdf', function ({asdf: renamed}) {
        expect(renamed).toBe(123);
      });
    `,
  });
  expect(results[0].status).toBe('passed');
});

it('should fail if parameters are not destructured', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'a.test.js': `
      const builder = baseFolio.extend();
      builder.asdf.init(async ({}, test) => await test(123));
      const { it } = builder.build();
      it('should pass', function () {
        expect(1).toBe(1);
      });
      it('should use asdf', function (abc) {
        expect(abc.asdf).toBe(123);
      });
    `,
  });
  expect(stripAscii(result.output)).toContain('First argument must use the object destructuring pattern: abc');
  expect(firstStackFrame(stripAscii(result.output))).toContain('a.test.js:10');
  expect(result.results.length).toBe(0);
});

it('should fail with an unknown fixture', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'a.test.js': `
      it('should use asdf', async ({asdf}) => {
        expect(asdf).toBe(123);
      });
    `,
  });
  expect(stripAscii(result.output)).toContain('Test has unknown parameter "asdf".');
  expect(firstStackFrame(stripAscii(result.output))).toContain('a.test.js:5');
  expect(result.results.length).toBe(0);
});

it('should run the fixture every time', async ({ runInlineFixturesTest }) => {
  const { results } = await runInlineFixturesTest({
    'a.test.js': `
      let counter = 0;
      const builder = baseFolio.extend();
      builder.asdf.init(async ({}, test) => await test(counter++));
      const { it } = builder.build();
      it('should use asdf', async ({asdf}) => {
        expect(asdf).toBe(0);
      });
      it('should use asdf', async ({asdf}) => {
        expect(asdf).toBe(1);
      });
      it('should use asdf', async ({asdf}) => {
        expect(asdf).toBe(2);
      });
    `,
  });
  expect(results.map(r => r.status)).toEqual(['passed', 'passed', 'passed']);
});

it('should only run worker fixtures once', async ({ runInlineFixturesTest }) => {
  const { results } = await runInlineFixturesTest({
    'a.test.js': `
      let counter = 0;
      const builder = baseFolio.extend();
      builder.asdf.init(async ({}, test) => await test(counter++), { scope: 'worker' });
      const { it } = builder.build();
      it('should use asdf', async ({asdf}) => {
        expect(asdf).toBe(0);
      });
      it('should use asdf', async ({asdf}) => {
        expect(asdf).toBe(0);
      });
      it('should use asdf', async ({asdf}) => {
        expect(asdf).toBe(0);
      });
    `,
  });
  expect(results.map(r => r.status)).toEqual(['passed', 'passed', 'passed']);
});

it('each file should get their own fixtures', async ({ runInlineFixturesTest }) => {
  const { results } = await runInlineFixturesTest({
    'a.test.js': `
      const builder = baseFolio.extend();
      builder.worker.init(async ({}, test) => await test('worker-a'), { scope: 'worker' });
      builder.test.init(async ({}, test) => await test('test-a'));
      const { it } = builder.build();
      it('should use worker', async ({worker, test}) => {
        expect(worker).toBe('worker-a');
        expect(test).toBe('test-a');
      });
    `,
    'b.test.js': `
      const builder = baseFolio.extend();
      builder.worker.init(async ({}, test) => await test('worker-b'), { scope: 'worker' });
      builder.test.init(async ({}, test) => await test('test-b'));
      const { it } = builder.build();
      it('should use worker', async ({worker, test}) => {
        expect(worker).toBe('worker-b');
        expect(test).toBe('test-b');
      });
    `,
    'c.test.js': `
      const builder = baseFolio.extend();
      builder.worker.init(async ({}, test) => await test('worker-c'), { scope: 'worker' });
      builder.test.init(async ({}, test) => await test('test-c'));
      const { it } = builder.build();
      it('should use worker', async ({worker, test}) => {
        expect(worker).toBe('worker-c');
        expect(test).toBe('test-c');
      });
    `,
  });
  expect(results.map(r => r.status)).toEqual(['passed', 'passed', 'passed']);
});

it('tests should be able to share worker fixtures', async ({ runInlineFixturesTest }) => {
  const { results } = await runInlineFixturesTest({
    'worker.js': `
      global.counter = 0;
      const builder = baseFolio.extend();
      builder.worker.init(async ({}, test) => await test(global.counter++), { scope: 'worker' });
      module.exports = builder.build();
    `,
    'a.test.js': `
      const { it } = require('./worker.js');
      it('should use worker', async ({worker}) => {
        expect(worker).toBe(0);
      });
    `,
    'b.test.js': `
      const { it } = require('./worker.js');
      it('should use worker', async ({worker}) => {
        expect(worker).toBe(0);
      });
    `,
    'c.test.js': `
      const { it } = require('./worker.js');
      it('should use worker', async ({worker}) => {
        expect(worker).toBe(0);
      });
    `,
  });
  expect(results.map(r => r.status)).toEqual(['passed', 'passed', 'passed']);
});

it('tests respect automatic test fixtures', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'a.test.js': `
      let counter = 0;
      const builder = baseFolio.extend();
      builder.automaticTestFixture.init(async ({}, runTest) => {
        ++counter;
        await runTest();
      }, { auto: true });
      const { it } = builder.build();
      it('test 1', async ({}) => {
        expect(counter).toBe(1);
      });
      it('test 2', async ({}) => {
        expect(counter).toBe(2);
      });
    `
  });
  expect(result.exitCode).toBe(0);
  expect(result.results.map(r => r.status)).toEqual(['passed', 'passed']);
});

it('tests respect automatic worker fixtures', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'a.test.js': `
      let counter = 0;
      const builder = baseFolio.extend();
      builder.automaticWorkerFixture.init(async ({}, runTest) => {
        ++counter;
        await runTest();
      }, { auto: true, scope: 'worker' });
      const { it } = builder.build();
      it('test 1', async ({}) => {
        expect(counter).toBe(1);
      });
      it('test 2', async ({}) => {
        expect(counter).toBe(1);
      });
    `
  });
  expect(result.exitCode).toBe(0);
  expect(result.results.map(r => r.status)).toEqual(['passed', 'passed']);
});

it('tests does not run non-automatic worker fixtures', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'a.test.js': `
      let counter = 0;
      const builder = baseFolio.extend();
      builder.nonAutomaticWorkerFixture.init(async ({}, runTest) => {
        ++counter;
        await runTest();
      }, { scope: 'worker' });
      const { it } = builder.build();
      it('test 1', async ({}) => {
        expect(counter).toBe(0);
      });
    `
  });
  expect(result.exitCode).toBe(0);
  expect(result.results.map(r => r.status)).toEqual(['passed']);
});

it('should teardown fixtures after timeout', async ({ runInlineFixturesTest, testInfo }) => {
  const file = testInfo.outputPath('log.txt');
  require('fs').writeFileSync(file, '', 'utf8');
  const result = await runInlineFixturesTest({
    'a.spec.ts': `
      const builder = baseFolio.extend();
      builder.file.initParameter('File', '');
      builder.t.init(async ({ file }, runTest) => {
        await runTest('t');
        require('fs').appendFileSync(file, 'test fixture teardown\\n', 'utf8');
      });
      builder.w.init(async ({ file }, runTest) => {
        await runTest('w');
        require('fs').appendFileSync(file, 'worker fixture teardown\\n', 'utf8');
      }, { scope: 'worker' });
      const { it } = builder.build();
      it('test', async ({t, w}) => {
        expect(t).toBe('t');
        expect(w).toBe('w');
        await new Promise(() => {});
      });
    `,
  }, { timeout: 1000, param: 'file=' + file });
  expect(result.results[0].status).toBe('timedOut');
  const content = require('fs').readFileSync(file, 'utf8');
  expect(content).toContain('worker fixture teardown');
  expect(content).toContain('test fixture teardown');
});

it('should work with two different fixture objects', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'a.test.js': `
      const builder1 = baseFolio.extend();
      builder1.foo.init(async ({}, test) => await test(123));
      const fixtures1 = builder1.build();
      const builder2 = baseFolio.extend();
      builder2.bar.init(async ({}, test) => await test(456));
      const fixtures2 = builder2.build();
      fixtures1.it('test 1', async ({foo}) => {
        expect(foo).toBe(123);
      });
      fixtures2.it('test 2', async ({bar}) => {
        expect(bar).toBe(456);
      });
    `,
  });
  expect(result.results.map(r => r.workerIndex).sort()).toEqual([0, 1]);
  expect(result.results.map(r => r.status).sort()).toEqual(['passed', 'passed']);
});

it('should work with fixtures union', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'a.test.js': `
      const builder1 = baseFolio.extend();
      builder1.foo.init(async ({}, test) => await test(123));
      const fixtures1 = builder1.build();
      const builder2 = baseFolio.extend();
      builder2.bar.init(async ({}, test) => await test(456));
      const fixtures2 = builder2.build();
      const { it } = fixtures1.union(fixtures2);
      it('test', async ({foo, bar}) => {
        expect(foo).toBe(123);
        expect(bar).toBe(456);
      });
    `,
  });
  expect(result.results[0].status).toBe('passed');
});

it('should work with overrides calling base', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'a.test.js': `
      const builder = baseFolio.extend();
      builder.dep.init(async ({}, test) => await test('override'));
      builder.foo.init(async ({}, test) => await test('base'));
      builder.bar.init(async ({foo}, test) => await test(foo + '-bar'));
      builder.foo.override(async ({ foo, dep }, test) => await test(foo + '-' + dep + '1'));
      builder.foo.override(async ({ foo, dep }, test) => await test(foo + '-' + dep + '2'));
      const { it } = builder.build();
      it('test', async ({bar}) => {
        expect(bar).toBe('base-override1-override2-bar');
      });
    `,
  });
  expect(result.results[0].status).toBe('passed');
});

it('should understand parameters in overrides calling base', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'a.test.js': `
      const builder = baseFolio.extend();
      builder.param.initParameter('Param', 'param');
      builder.foo.init(async ({}, test) => await test('foo'));
      builder.bar.init(async ({foo}, test) => await test(foo + '-bar'));
      builder.foo.override(async ({ foo, param }, test) => await test(foo + '-' + param));
      builder.foo.override(async ({ foo }, test) => await test(foo + '-override'));
      const fixtures = builder.build();
      fixtures.generateParametrizedTests('param', ['p1', 'p2', 'p3']);
      fixtures.it('test', async ({ bar }) => {
        console.log(bar);
      });
    `,
  });
  const outputs = result.results.map(r => r.stdout[0].text.replace(/\s/g, ''));
  expect(outputs.sort()).toEqual(['foo-p1-override-bar', 'foo-p2-override-bar', 'foo-p3-override-bar']);
});

it('should work with two overrides calling base', async ({ runInlineFixturesTest }) => {
  const result = await runInlineFixturesTest({
    'a.test.js': `
      const builder = baseFolio.extend();
      builder.foo.init(async ({}, test) => await test('foo'));
      builder.bar.init(async ({}, test) => await test('bar'));
      builder.baz.init(async ({foo, bar}, test) => await test(foo + '-baz-' + bar));
      builder.foo.override(async ({ foo, bar }, test) => await test(foo + '-' + bar));
      builder.bar.override(async ({ bar }, test) => await test(bar + '-override'));
      const { it } = builder.build();
      it('test', async ({baz}) => {
        expect(baz).toBe('foo-bar-override-baz-bar-override');
      });
    `,
  });
  expect(result.results[0].status).toBe('passed');
});

it('should work with proxy syntax', async ({ runInlineFixturesTest }) => {
  const { results } = await runInlineFixturesTest({
    'a.test.js': `
      const builder = baseFolio.extend();
      builder.t.init(async ({}, run) => await run('t'));
      builder.w.init(async ({}, run) => await run('w'), { scope: 'worker' });
      builder.t.override(async ({}, run) => await run('override'));
      const { it } = builder.build();
      it('should work', async ({t, w}) => {
        expect(t).toBe('override');
        expect(w).toBe('w');
      });
    `,
  });
  expect(results[0].status).toBe('passed');
});
