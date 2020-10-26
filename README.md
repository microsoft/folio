# Folio ![npm](https://img.shields.io/npm/v/folio)

A customizable test framework to build your own test frameworks. Foundation for the [Playwright test runner](https://github.com/microsoft/playwright-test).

## Docs

- [Fixtures](#fixtures)
  - [Base concepts](#base-concepts)
  - [Test fixtures](#test-fixtures)
  - [Worker fixtures](#worker-fixtures)
- [Annotations](#annotations)
  - [Annotation API](#annotation-api)
  - [Flaky tests](#flaky-tests)
- [Built-in fixtures](#built-in-fixtures)
  - [testWorkerIndex](#testworkerindex)
  - [testInfo](#testinfo)
- [Reporters](#reporters)
  - [Reporter API](#reporter-api)
- [Parameters](#parameters)
  - [In the command line](#in-the-command-line)
  - [Generating tests](#generating-tests)
- [Parallelism and sharding](#parallelism-and-sharding)
  - [Workers](#workers)
  - [Shards](#shards)
- [Command line](#command-line)

## Fixtures

### Base concepts

Folio is based on the concept of the test fixtures. Test fixtures are used to establish environment for each test, giving the test everything it needs and nothing else. Here is how typical test environment setup differs between traditional BDD and the fixture-based one:

#### Without fixtures

```ts
describe('database', () => {
  let database;
  let table;

  beforeAll(async () => {
    database = await connect();
  });

  afterAll(async () => {
    await database.dispose();
  });

  beforeEach(async ()=> {
    table = await database.createTable();
  });

  afterEach(async () => {
    await database.dropTable(table);
  });

  it('create user', () => {
    table.insert();
    // ...
  });

  it('update user', () => {
    table.insert();
    table.update();
    // ...
  });

  it('delete user', () => {
    table.insert();
    table.delete();
    // ...
  });
});
```

#### With fixtures

```ts
import { folio } from 'folio';

const fixtures = folio.extend<{ table: Table }, { database: Database }>();

fixtures.database.init(async ({}, run) => {
  const database = await connect();
  await run(database);
  await database.dispose();
}, { scope: 'worker' });

fixtures.table.init(async ({ database }, run) => {
  const table = await database.createTable();
  await run(table);
  await database.dropTable(table);
});

const { it } = fixtures.build();

it('create user', ({ table }) => {
  table.insert();
  // ...
});

it('update user', ({ table }) => {
  table.insert();
  table.update();
  // ...
});

it('delete user', ({ table }) => {
  table.insert();
  table.delete();
  // ...
});
```

You declare exact fixtures that the test needs and the runner initializes them for each test individually. Tests can use any combinations of the fixtures to tailor precise environment they need. You no longer need to wrap tests in `describe`s that set up environment, everything is declarative and typed.

There are two types of fixtures: `test` and `worker`. Test fixtures are set up for each test and worker fixtures are set up for each process that runs test files.

### Test fixtures

Test fixtures are set up for each test. Consider the following test file:

```ts
// hello.spec.ts
import { it, expect } from './hello.folio';

it('hello world', ({ hello, world }) => {
  expect(`${hello}, ${world}!`).toBe('Hello, World!');
});

it('hello test', ({ hello, test }) => {
  expect(`${hello}, ${test}!`).toBe('Hello, Test!');
});
```

It uses fixtures `hello`, `world` and `test` that are set up by the framework for each test run.

Here is how test fixtures are declared and defined:

```ts
// hello.folio.ts
import { folio as base } from 'folio';
export { expect } from 'folio';

// Define test fixtures |hello|, |world| and |test|.
type TestFixtures = {
  hello: string;
  world: string;
  test: string;
};
const fixtures = base.extend<TestFixtures>();

fixtures.hello.init(async ({}, run) => {
  // Set up fixture.
  const value = 'Hello';
  // Run the test with the fixture value.
  await run(value);
  // Clean up fixture.
});

fixtures.world.init(async ({}, run) => {
  await run('World');
});

fixtures.test.init(async ({}, run) => {
  await run('Test');
});

const folio = fixtures.build();
export const it = folio.it;
```

Fixtures can use other fixtures.

```ts
  ...
  helloWorld: async ({hello, world}, run) => {
    await run(`${hello}, ${world}!`);
  }
  ...
```

With fixtures, test organization becomes flexible - you can put tests that make sense next to each other based on what they test, not based on the environment they need.


### Worker fixtures

Folio uses worker processes to run test files. You can specify the maximum number of workers using `--workers` command line option. Similarly to how test fixtures are set up for individual test runs, worker fixtures are set up for each worker process. That's where you can set up services, run servers, etc. Folio will reuse the worker process for as many test files as it can, provided their worker fixtures match and hence environments are identical.

Here is how the test looks:
```ts
// express.spec.ts
import { it, expect } from './express.folio';
import fetch from 'node-fetch';

it('fetch 1', async ({ port }) => {
  const result = await fetch(`http://localhost:${port}/1`);
  expect(await result.text()).toBe('Hello World 1!');
});

it('fetch 2', async ({ port }) => {
  const result = await fetch(`http://localhost:${port}/2`);
  expect(await result.text()).toBe('Hello World 2!');
});
```

And here is how fixtures are declared and defined:
```ts
// express.folio.ts
import { folio as base } from 'folio';
export { expect } from 'folio';
import express from 'express';
import type { Express } from 'express';

// Declare worker fixtures.
type ExpressWorkerFixtures = {
  port: number;
  express: Express;
};
const fixtures = base.extend<{}, ExpressWorkerFixtures>();

// |port| fixture has a unique value value of the worker process index.
fixtures.port.init(async ({ testWorkerIndex }, run) => {
  await run(3000 + testWorkerIndex);
}, { scope: 'worker' });

// |express| fixture starts automatically for every worker.
fixtures.express.init(async ({ port }, run) => {
  const app = express();
  app.get('/1', (req, res) => {
    res.send('Hello World 1!')
  });
  app.get('/2', (req, res) => {
    res.send('Hello World 2!')
  });
  let server;
  console.log('Starting server...');
  await new Promise(f => {
    server = app.listen(port, f);
  });
  console.log('Server ready');
  await run(server);
  console.log('Stopping server...');
  await new Promise(f => server.close(f));
  console.log('Server stopped');
}, { scope: 'worker', auto: true });

const folio = fixtures.build();
export const it = folio.it;
```

## Annotations

Unfortunately, tests do not always pass. Folio supports test annotations to deal with failures, flakiness and tests that are not yet ready. Pass an additional callback to annotate a test or a suite.

```ts
it('my test', test => {
  test.skip(!!process.env.SKIP_MY_TESTS, 'Do not run this test when SKIP_MY_TESTS is set');
  test.slow('This increases test timeout 3x.');
}, async ({ table }) => {
  // Test goes here.
});
```

### Annotation API

There are multiple annotation methods, each supports an optional condition and description. Respective annotation applies only when the condition is truthy.
Annotations may depend on the parameters. There could be multiple annotations on the same test, possibly in different configurations. For example, to skip a test in unsupported api version, and mark it slow otherwise:

```ts
it('my test', (test, { version }) => {
  test.fixme(version === 'v2', 'This test should be passing, but it crashes the database server v2. Better not run it.');
  test.slow('The table is very large');
}, async ({ table }) => {
  // Test goes here.
});
```

Possible annotations include:
- `skip` marks the test as irrelevant. Folio does not run such a test. Use this annotation when the test is not applicable in some configuration.
   ```ts
   test.skip(version === 'v1', 'Not supported in version 1.');
   ```
- `fail` marks the test as failing. Folio will run this test and ensure it does indeed fail. If the test does not fail, Folio will complain.
   ```ts
   test.fail('We have a bug.');
   ```
- `slow` marks the test as slow, increasing the timeout 3x.
   ```ts
   test.slow(version === 'v2', 'Version 2 is slow with sequential updates.');
   ```
- `fixme` marks the test as failing. Folio will not run this test, as opposite to the `fail` annotation. Use `fixme` when running the test is slow or crashy.
   ```ts
   test.fixme('Crashes the database server. Better not run it. We should fix that.');
   ```
- `flaky` marks the test as either passing or failing. Folio will run this test, and consider it passing if at least one retry succeeds.
   ```ts
   test.flaky('Oh well...');
   ```

### Flaky tests

Folio deals with flaky tests with retries and `flaky` annotations. Pass the maximum number of retries when running the tests:
```sh
npx folio test/ --retries 3
```

Failing tests will be retried multiple times until they pass, or the maximium number of retries is reached. By default, if the test fails at least once, Folio will report it as "unexpected flaky". For example, if the test passes on the second retry, Folio will report something like this:

```sh
Running 1 test using 1 worker
××±
1 unexpected flaky
  1) my.test.js:1:1
    <Error from the first run>
    Retry #1
    <Error from the first retry>
```

However, known flaky tests can be marked as `flaky`, so that Folio reports them as "expected flaky" and succeeds the test run.

```ts
it('my test', test => {
  test.flaky('Database sometimes fails with the large table.');
}, async ({ table }) => {
  // Test goes here.
});
```

If the test passes on the second retry, Folio will report something like this:
```sh
Running 1 test using 1 worker
××±
  1 expected flaky
```

## Built-in fixtures

Folio provides a few built-in fixtures with information about tests.

### testWorkerIndex

This is a worker fixture - a unique number assigned to the worker process. Depending on the configuration and failures, Folio might use different number of worker processes to run all the tests. For example, Folio will always start a new worker process after a failing test. To differentiate between workers, use `testWorkerIndex`. Consider an example where we run a new http server per worker process, and use `testWorkerIndex` to produce a unique port number:

```ts
import { folio as base } from 'folio';
import * as http from 'http';

const fixtures = base.extend<{}, { server: http.Server }>();

fixtures.server.init(async ({ testWorkerIndex }, runTest) => {
  const server = await http.createServer();
  server.listen(9000 + testWorkerIndex);
  await new Promise(ready => server.once('listening', ready));
  await runTest(server);
  await new Promise(done => server.close(done));
}, { scope: 'worker' });

export const folio = fixtures.build();
```

### testInfo

This is a test fixture that contains information about the currently running test. It can be used in any test fixture, for example:

```ts
import { folio as base } from 'folio';
import * as sqlite3 from 'sqlite3';

const fixtures = base.extend<{ db: sqlite3.Database }>();

// Create a database per test.
fixtures.db.init(async ({ testInfo }, runTest) => {
  const dbFile = testInfo.outputPath('db.sqlite');
  let db;
  await new Promise(ready => {
    db = new sqlite3.Database(dbFile, ready);
  });
  await runTest(db);
  await new Promise(done => db.close(done));
});

export const folio = fixtures.build();
```

The following information is accessible to test fixtures when running the test:
- `title: string` - test title.
- `file: string` - full path to the test file.
- `location: string` - full path, line and column numbers of the test declaration.
- `fn: Function` - test body funnction.
- `parameters: object` - parameter values used in this particular test run.
- `workerIndex: number` - unique number assigned to the worker process, same as `testWorkerIndex` fixture.
- `repeatEachIndex: number` - the sequential repeat index, when running with `--repeat-each=<number>` option.
- `retry: number` - the sequential number of the test retry (zero means first run), when running with `--retries=<number>` option.
- `expectedStatus: 'passed' | 'failed' | 'timedOut'` - whether this test is expected to pass, fail or timeout.
- `timeout: number` - test timeout. Defaults to `--timeout=<ms>` option, but also affected by `test.slow()` annotation.
- `relativeArtifactsPath: string` - relative path, used to store snapshots and output for the test.
- `snapshotPath(...pathSegments: string[])` - function that returns the full path to a particular snapshot for the test.
- `outputPath(...pathSegments: string[])` - function that returns the full path to a particular output artifact for the test.

The following information is accessible after the test body has finished (e.g. after calling `runTest`):
- `duration: number` - test running time in milliseconds.
- `status: 'passed' | 'failed' | 'timedOut'` - the actual test result.
- `error` - any error thrown by the test body.
- `stdout: (string | Buffer)[]` - array of stdout chunks collected during the test run.
- `stderr: (string | Buffer)[]` - array of stderr chunks collected during the test run.

Here is an example fixture that automatically saves debug logs on the test failure:
```ts
import { folio as base } from 'folio';
import * as debug from 'debug';
import * as fs from 'fs';

const fixtures = base.extend<{ saveLogsOnFailure: void }>();

fixtures.saveLogsOnFailure.init(async ({ testInfo }, runTest) => {
  const logs = [];
  debug.log = (...args) => logs.push(args.map(String).join(''));
  debug.enable('mycomponent');
  await runTest();
  if (testInfo.status !== testInfo.expectedStatus)
    fs.writeFileSync(testInfo.outputPath('logs.txt'), logs.join('\n'), 'utf8');
}, { auto: true );

export const folio = fixtures.build();
```

## Parameters

It is common to run tests in different configurations, for example running web app tests against multiple browsers or testing two different API versions. Folio supports this via parameters: you can define a parameter and start using it in a test or a fixture.

In the example below, we create the `version` parameter, which is used by the `apiUrl` fixture.

```ts
// api.folio.ts
import { folio as base } from 'folio';
export { expect } from 'folio';

// Declare types for new fixture and parameters
const fixtures = base.extend<{}, { apiUrl: string }, { version: string }>();

// Define version parameter with description and default value
fixtures.version.initParameter('API version', 'v1');

// Define apiUrl fixture which uses the version parameter
fixtures.apiUrl.init(async ({ version }, runTest) => {
  const server = await startServer();
  await runTest(`http://localhost/api/${version}`);
  await server.close();
}, { scope: 'worker' });

const folio = fixtures.build();
export const it = folio.it;
```

Your tests can use the `apiUrl` fixture, which depends on the `version` parameter.

```ts
// api.spec.ts
import { it, expect } from './api.folio';
import fetch from 'node-fetch';

it('fetch 1', async ({ apiUrl }) => {
  const result = await fetch(`${apiUrl}/hello`);
  expect(await result.text()).toBe('Hello');
});
```

### In the command line

Given the above example, it is possible to run tests against a specific API version from CLI.

```sh
# Run against the default version (v1).
npx folio tests

# Run against the specified version.
npx folio tests -p version=v2

# Run against multiple versions.
npx folio tests -p version=v1 -p version=v2
```

### Generating tests

You can also generate tests for different values of parameters. This enables you to reuse your tests across different configurations.

```ts
// api.folio.ts
// ...
const folio = builder.build();

// Generate three versions of each test that directly or indirectly
// depends on the |version| parameter.
folio.generateParametrizedTests('version', ['v1', 'v2', 'v3']);

export const it = folio.it;
```

Run the generated tests via CLI.

```sh
# Run tests across specified versions.
npx folio
```

With [annotations](#annotations), you can specify skip criteria that relies on parameter values.

```js
it('tests new api features', (test, { version }) => {
  test.skip(version !== 'v3', 'skipped for older api versions');
}, async ({ apiUrl }) => {
  // Test function
});
```
