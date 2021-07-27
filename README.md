# Folio ![npm](https://img.shields.io/npm/v/folio)

If you are looking for Playwright Test, see on [playwright.dev](https://playwright.dev/docs/test-intro) for the documentation and examples.

A highly customizable test framework.

Folio is **available in preview** and is under active development. Breaking changes could happen. We welcome your feedback to shape this towards 1.0.

## Docs

- [Writing a test](#writing-a-test)
- [Fixtures](#fixtures)
  - [Test fixtures](#test-fixtures)
  - [Worker fixtures](#worker-fixtures)
- [Writing a configuration file](#writing-a-configuration-file)
  - [Changing the timeout](#changing-the-timeout)
- [Command line](#command-line)
- [Snapshots](#snapshots)
- [Annotations](#annotations)
  - [Flaky tests](#flaky-tests)
- [Parallelism and sharding](#parallelism-and-sharding)
  - [Workers](#workers)
  - [Shards](#shards)
- [Reporters](#reporters)
  - [Built-in reporters](#built-in-reporters)
  - [Reporter API](#reporter-api)
- [Advanced configuration](#advanced-configuration)
  - [Configuration object](#configuration-object)
  - [Projects](#projects)
  - [workerInfo](#workerinfo)
  - [testInfo](#testinfo)
  - [Global setup and teardown](#global-setup-and-teardown)
  - [Fixture options](#fixture-options)
  - [Add custom matchers using expect.extend](#add-custom-matchers-using-expectextend)

## Writing a test

Writing your first test is easy.

```ts
// example.spec.ts
import test from 'folio';

test('let us check some basics', async () => {
  test.expect(1 + 1).toBe(2);
});
```

You can now run the test.

```sh
# Assuming my.spec.ts is in the current directory.
npx folio -c .
```

Note: Folio uses [`expect`](https://jestjs.io/docs/expect) library for test assertions.

## Fixtures

Folio is based on the concept of the test fixtures. Test fixtures are used to establish environment for each test, giving the test everything it needs and nothing else. Test fixtures are isolated between tests, which gives Folio numerous advantages:
- Folio runs tests in parallel by default, making your test suite much faster.
- Folio can efficiently retry the flaky failures, instead of re-running the whole suite.
- You can group tests based on their meaning, instead of their common setup.

Here is how typical test environment setup differs between traditional test style and the fixture-based one:

#### Without fixtures

```ts
// example.spec.ts

describe('database', () => {
  let table;

  beforeEach(async ()=> {
    table = await createTable();
  });

  afterEach(async () => {
    await dropTable(table);
  });

  test('create user', () => {
    table.insert();
    // ...
  });

  test('update user', () => {
    table.insert();
    table.update();
    // ...
  });

  test('delete user', () => {
    table.insert();
    table.delete();
    // ...
  });
});
```

#### With fixtures

```ts
// example.spec.ts
import base from 'folio';

// Extend basic test by providing a "table" fixture.
const test = base.extend<{ table: Table }>({
  table: async ({}, use) => {
    const table = await createTable();
    await use(table);
    await dropTable(table);
  },
});

test('create user', ({ table }) => {
  table.insert();
  // ...
});

test('update user', ({ table }) => {
  table.insert();
  table.update();
  // ...
});

test('delete user', ({ table }) => {
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
import test from './hello';

test('hello', ({ hello }) => {
  test.expect(hello).toBe('Hello');
});

test('hello world', ({ helloWorld }) => {
  test.expect(helloWorld).toBe('Hello, world!');
});
```

It uses fixtures `hello` and `helloWorld` that are set up by the framework for each test run.

Here is how test fixtures are declared and defined. Fixtures can use other fixtures - note how `helloWorld` uses `hello`.

```ts
// hello.ts
import base from 'folio';

// Define test fixtures "hello" and "helloWorld".
type TestFixtures = {
  hello: string;
  helloWorld: string;
};

// Extend base test with our fixtures.
const test = base.extend<TestFixtures>({
  // This fixture is a constant, so we can just provide the value.
  hello: 'Hello',

  // This fixture has some complex logic and is defined with a function.
  helloWorld: async ({ hello }, use) => {
    // Set up the fixture.
    const value = hello + ', world!';

    // Use the fixture value in the test.
    await use(value);

    // Clean up the fixture. Nothing to cleanup in this example.
  },
});

// Now, this "test" can be used in multiple test files, and each of them will get the fixtures.
export default test;
```

With fixtures, test organization becomes flexible - you can put tests that make sense next to each other based on what they test, not based on the environment they need.

### Worker fixtures

Folio uses worker processes to run test files. You can specify the maximum number of workers using `--workers` command line option. Similarly to how test fixtures are set up for individual test runs, worker fixtures are set up for each worker process. That's where you can set up services, run servers, etc. Folio will reuse the worker process for as many test files as it can, provided their worker fixtures match and hence environments are identical.

Here is how the test looks:
```ts
// express.spec.ts
import test from './express-test';
import fetch from 'node-fetch';

test('fetch 1', async ({ port }) => {
  const result = await fetch(`http://localhost:${port}/1`);
  test.expect(await result.text()).toBe('Hello World 1!');
});

test('fetch 2', async ({ port }) => {
  const result = await fetch(`http://localhost:${port}/2`);
  test.expect(await result.text()).toBe('Hello World 2!');
});
```

And here is how fixtures are declared and defined:
```ts
// express-test.ts
import base from 'folio';
import express from 'express';
import type { Express } from 'express';

// Declare worker fixtures.
type ExpressWorkerFixtures = {
  port: number;
  express: Express;
};

// Note that we did not provide an test-scoped fixtures, so we pass {}.
const test = base.extend<{}, ExpressWorkerFixtures>({

  // We pass a tuple to with the fixture function and options.
  // In this case, we mark this fixture as worker-scoped.
  port: [ async ({}, use, workerInfo) => {
    // "port" fixture uses a unique value of the worker process index.
    await use(3000 + workerInfo.workerIndex);
  }, { scope: 'worker' } ],

  // "express" fixture starts automatically for every worker - we pass "auto" for that.
  express: [ async ({ port }, use) => {
    // Setup express app.
    const app = express();
    app.get('/1', (req, res) => {
      res.send('Hello World 1!')
    });
    app.get('/2', (req, res) => {
      res.send('Hello World 2!')
    });

    // Start the server.
    let server;
    console.log('Starting server...');
    await new Promise(f => {
      server = app.listen(port, f);
    });
    console.log('Server ready');

    // Use the server in the tests.
    await use(server);

    // Cleanup.
    console.log('Stopping server...');
    await new Promise(f => server.close(f));
    console.log('Server stopped');
  }, { scope: 'worker', auto: true } ],
});

export default test;
```

## Writing a configuration file

Folio allows writing a configuration file that specifies how to run the tests.
```ts
// folio.config.ts
import * as folio from 'folio';

const config: folio.Config = {
  // Look for tests in this directory.
  testDir: __dirname,

  // Give each test 20 seconds.
  timeout: 20000,

  // Give each test two retries.
  retries: 2,
};

export default config;
```

Look at the [configuration object](#configuration-object) for the available options.

Folio will automatically pick up the `folio.config.ts` or `folio.config.js` file in the current directory:
```sh
npx folio
```

Alternatively, specify the configuration file manually:
```sh
npx folio --config=my.config.ts
```

### Example - changing the timeout

There are a few ways to change the test timeout - the amount of time in milliseconds per each test. Passing a zero timeout in any of these disables the timeout.

- Using the configuration file.
```ts
// folio.config.ts
const config = {
  timeout: 5000,
};
export default config;
```

- Using a [command line](#command-line) option.
```sh
# Disable timeout for all tests, e.g. for debugging.
npx folio --timeout=0
```

- Calling `test.setTimeout(milliseconds)` in the test itself.
```ts
// example.spec.ts
import test from 'folio';

test('my test', async () => {
  // Give this test 5 seconds.
  test.setTimeout(5000);
});
```

- Calling `test.slow()` to triple the timeout.
```ts
// example.spec.ts
import test from 'folio';

test('my test', async () => {
  test.slow();
});
```

## Command line

```sh
# Ask for help!
npx folio --help
```

Arguments passed to `npx folio` are treated as a filter for test files. For example, `npx folio my-spec` will only run tests from files with `my-spec` in the name.

All the options are available in the [configuration file](#writing-a-configuration-file). However, selected options can be passed to a command line and take a priority over the configuration file:
- `--config <file>` or `-c <file>`: Configuration file. Defaults to `folio.config.ts` or `folio.config.js` in the current directory.
- `--forbid-only`: Whether to disallow `test.only` exclusive tests. Useful on CI. Overrides `config.forbidOnly` option from the configuration file.
- `--grep <grep>` or `-g <grep>`: Only run tests matching this regular expression, for example `/my.*test/i` or `my-test`. Overrides `config.grep` option from the configuration file.
- `--global-timeout <number>`: Total timeout in milliseconds for the whole test run. By default, there is no global timeout. Overrides `config.globalTimeout` option from the configuration file.
- `--help`: Display help.
- `--list`: List all the tests, but do not run them.
- `--max-failures <N>` or `-x`: Stop after the first `N` test failures. Passing `-x` stops after the first failure. Overrides `config.maxFailures` option from the configuration file.
- `--output <dir>`: Directory for artifacts produced by tests, defaults to `test-results`. Overrides `config.outputDir` option from the configuration file.
- `--quiet`: Whether to suppress stdout and stderr from the tests. Overrides `config.quiet` option from the configuration file.
- `--repeat-each <number>`: Specifies how many times to run each test. Defaults to one. Overrides `config.repeatEach` option from the configuration file.
- `--reporter <reporter>`. Specify reporter to use, comma-separated, can be some combination of `dot`, `json`, `junit`, `line`, `list` and `null`. See [reporters](#reporters) for more information.
- `--retries <number>`: The maximum number of retries for each [flaky test](#flaky-tests), defaults to zero (no retries). Overrides `config.retries` option from the configuration file.
- `--shard <shard>`: [Shard](#shards) tests and execute only selected shard, specified in the form `current/all`, 1-based, for example `3/5`. Overrides `config.shard` option from the configuration file.
- `--project <project...>`: Only run tests from one of the specified [projects](#projects). Defaults to running all projects defined in the configuration file.
- `--timeout <number>`: Maximum timeout in milliseconds for each test, defaults to 10 seconds. Overrides `config.timeout` option from the configuration file.
- `--update-snapshots` or `-u`: Whether to update snapshots with actual results instead of comparing them. Use this when snapshot expectations have changed. Overrides `config.updateSnapshots` option from the configuration file.
- `--workers <workers>` or `-j <workers>`: The maximum number of concurrent worker processes.  Overrides `config.workers` option from the configuration file.

## Annotations

Unfortunately, tests do not always pass. Folio supports test annotations to deal with failures, flakiness and tests that are not yet ready.

```ts
// example.spec.ts
import test from 'folio';

test('basic', async ({ table }) => {
  test.skip(version == 'v2', 'This test crashes the database in v2, better not run it.');
  // Test goes here.
});

test('can insert multiple rows', async ({ table }) => {
  test.fail('Broken test, but we should fix it!');
  // Test goes here.
});
```

Annotations may be conditional, in which case they only apply when the condition is truthy. Annotations may depend on test arguments. There could be multiple annotations on the same test, possibly in different configurations.

Possible annotations include:
- `skip` marks the test as irrelevant. Folio does not run such a test. Use this annotation when the test is not applicable in some configuration.
- `fail` marks the test as failing. Folio will run this test and ensure it does indeed fail. If the test does not fail, Folio will complain.
- `fixme` marks the test as failing. Folio will not run this test, as opposite to the `fail` annotation. Use `fixme` when running the test is slow or crashy.
- `slow` marks the test as slow and triples the test timeout.

### Flaky tests

Folio deals with flaky tests with retries. Pass the maximum number of retries when running the tests, or set them in the [configuration file](#writing-a-configuration-file).
```sh
npx folio --retries=3
```

Failing tests will be retried multiple times until they pass, or until the maximum number of retries is reached. Folio will report all tests that failed at least once:

```sh
Running 1 test using 1 worker
××±
1 flaky
  1) my.test.js:1:1
```

## Snapshots

Folio includes the ability to produce and compare snapshots. For that, use `expect(value).toMatchSnapshot(snapshotName)`. Folio auto-detects the content type, and includes built-in matchers for text, png and jpeg images, and arbitrary binary data.

```ts
// example.spec.ts
import test from 'folio';

test('my test', async () => {
  const image = await produceSomePNG();
  test.expect(image).toMatchSnapshot('snapshot-name.png');
});
```

Snapshots are stored next to the test files, and you should commit them to the version control system.

## Parallelism and sharding

Folio runs tests in parallel by default, using multiple worker processes.

### Workers

Each worker process creates a new environment to run tests. Different projects always run in different workers. By default, Folio reuses the worker as much as it can to make testing faster, but it will create a new worker when retrying tests, after any test failure, to initialize a new environment, or just to speed up test execution if the worker limit is not reached.

The maximum number of worker processes is controlled via [command line](#command-line) or [configuration object](#configuration-object).

Each worker process is assigned a unique sequential index that is accessible through [`workerInfo`](#workerinfo) object.

### Shards

Folio can shard a test suite, so that it can be executed on multiple machines. For that,  pass `--shard=x/y` to the command line. For example, to split the suite into three shards, each running one third of the tests:
```sh
npx folio --shard=1/3
npx folio --shard=2/3
npx folio --shard=3/3
```

## Reporters

Folio comes with a few built-in reporters for different needs and ability to provide custom reporters. The easiest way to try out built-in reporters is to pass `--reporter` [command line option](#command-line).

```sh
npx folio --reporter=line
```

For more control, you can specify reporters programmatically in the [configuration file](#writing-a-configuration-file).

```ts
// folio.config.ts
import * as folio from 'folio';

const config: folio.Config = {
  reporter: 'dot',
};

// More complex example:
const config2: folio.Config = {
  reporter: !process.env.CI
    // A long list of tests for the terminal.
    ? 'list'
    // Entirely different config on CI.
    // Use very concise "dot" reporter plus a comprehensive json report.
    : [
      ['dot'],
      [ 'json', { outputFile: 'test-results.json' }]
    ],
};

export default config;
```

### Built-in reporters

All built-in reporters show detailed information about failures, and mostly differ in verbosity for successful runs.

#### List reporter

List reporter is default. It prints a line for each test being run. Use it with `--reporter=list` or `reporter: 'list'`.

```ts
// folio.config.ts
const config = {
  reporter: 'list',
};
export default config;
```

Here is an example output in the middle of a test run. Failures will be listed at the end.
```sh
npx folio --reporter=list
Running 124 tests using 6 workers

  ✓ should access error in env (438ms)
  ✓ handle long test names (515ms)
  x 1) render expected (691ms)
  ✓ should timeout (932ms)
    should repeat each:
  ✓ should respect enclosing .gitignore (569ms)
    should teardown env after timeout:
    should respect excluded tests:
  ✓ should handle env beforeEach error (638ms)
    should respect enclosing .gitignore:
```

#### Line reporter

Line reporter is more concise than the list reporter. It uses a single line to report last finished test, and prints failures when they occur. Line reporter is useful for large test suites where it shows the progress but does not spam the output by listing all the tests. Use it with `--reporter=line` or `reporter: 'line'`.

```ts
// folio.config.ts
const config = {
  reporter: 'line',
};
export default config;
```

Here is an example output in the middle of a test run. Failures are reported inline.
```sh
npx folio --reporter=line
Running 124 tests using 6 workers
  1) dot-reporter.spec.ts:20:1 › render expected ===================================================

    Error: expect(received).toBe(expected) // Object.is equality

    Expected: 1
    Received: 0

[23/124] gitignore.spec.ts - should respect nested .gitignore
```

#### Dot reporter

Dot reporter is very concise - it only produces a single character per successful test run. It is useful on CI where you don't want a lot of output. Use it with `--reporter=dot` or `reporter: 'dot'`.

```ts
// folio.config.ts
const config = {
  reporter: 'dot',
};
export default config;
```

Here is an example output in the middle of a test run. Failures will be listed at the end.
```sh
npx folio --reporter=dot
Running 124 tests using 6 workers
······F·············································
```

#### JSON reporter

JSON reporter produces an object with all information about the test run. It is usually used together with some terminal reporter like `dot` or `line`.

Most likely you want to write the JSON to a file. When running with `--reporter=json`, use `FOLIO_JSON_OUTPUT_NAME` environment variable:
```sh
FOLIO_JSON_OUTPUT_NAME=results.json npx folio --reporter=json,dot
```

In configuration file, pass options directly:
```ts
// folio.config.ts
const config = {
  reporter: [ ['json', { outputFile: 'results.json' }] ],
};
export default config;
```

#### JUnit reporter

JUnit reporter produces a JUnit-style xml report. It is usually used together with some terminal reporter like `dot` or `line`.

Most likely you want to write the report to an xml file. When running with `--reporter=junit`, use `FOLIO_JUNIT_OUTPUT_NAME` environment variable:
```sh
FOLIO_JUNIT_OUTPUT_NAME=results.xml npx folio --reporter=junit,line
```

In configuration file, pass options directly:
```ts
// folio.config.ts
const config = {
  reporter: [ ['junit', { outputFile: 'results.xml' }] ],
};
export default config;
```

## Advanced configuration

### Configuration object

Configuration file exports a single configuration object.

Test project configuration properties:
- `metadata: any` - Any JSON-serializable metadata that will be put directly to the test report.
- `name: string` - Project name, useful when defining multiple [test projects](#projects).
- `outputDir: string` - Output directory for files created during the test run.
- `repeatEach: number` - The number of times to repeat each test, useful for debugging flaky tests. Overridden by `--repeat-each` command line option.
- `retries: number` - The maximum number of retry attempts given to failed tests. Overridden by `--retries` command line option.
- `testDir: string` - Directory that will be recursively scanned for test files.
- `testIgnore: string | RegExp | (string | RegExp)[]` - Files matching one of these patterns are not considered test files.
- `testMatch: string | RegExp | (string | RegExp)[]` - Only the files matching one of these patterns are considered test files.
- `timeout: number` - Timeout for each test in milliseconds. Overridden by `--timeout` command line option.

Test execution configuration properties:
- `forbidOnly: boolean` - Whether to exit with an error if any tests are marked as `test.only`. Useful on CI. Overridden by `--forbid-only` command line option.
- `globalSetup: string` - Path to the global setup file. This file will be required and run before all the tests. It must export a single function.
- `globalTeardown: string` - Path to the global teardown file. This file will be required and run after all the tests. It must export a single function.
- `globalTimeout: number` - Total timeout in milliseconds for the whole test run. Overridden by `--global-timeout` command line option.
- `grep: RegExp | RegExp[]` - Patterns to filter tests based on their title. Overridden by `--grep` command line option.
- `maxFailures: number` - The maximum number of test failures for this test run. After reaching this number, testing will stop and exit with an error. Setting to zero (default) disables this behavior. Overridden by `--max-failures` and `-x` command line options.
- `preserveOutput: 'always' | 'never' | 'failures-only'` - Whether to preserve test output in the `outputDir`:
  - `'always'` - preserve output for all tests;
  - `'never'` - do not preserve output for any tests;
  - `'failures-only'` - only preserve output for failed tests.
- `projects: Project[]` - Multiple [projects](#projects) configuration.
- `reporter: 'list' | 'line' | 'dot' | 'json' | 'junit'` - The reporter to use. See [reporters](#reporters) for details.
- `quiet: boolean` - Whether to suppress stdout and stderr from the tests. Overridden by `--quiet` command line option.
- `shard: { total: number, current: number } | null` - [Shard](#shards) information. Overridden by `--shard` command line option.
- `updateSnapshots: boolean` - Whether to update expected snapshots with the actual results produced by the test run. Overridden by `--update-snapshots` command line option.
- `workers: number` - The maximum number of concurrent worker processes to use for parallelizing tests. Overridden by `--workers` command line option.


```ts
// folio.config.ts
import * as folio from 'folio';

const config: folio.Config = {
  // 20 seconds per test.
  timeout: 20000,

  // Forbid test.only on CI.
  forbidOnly: !!process.env.CI,

  // Two retries for each test.
  retries: 2,
});
export default config;
```

### Projects

Folio supports running multiple test projects at the same time. This is useful for running the same tests in multiple configurations. For example, consider running tests against multiple versions of the database.

To make use of this feature, we will declare an "option fixture" for the database version, and use it in the tests.

```ts
// my-test.ts
import base from folio;

const test = base.extend<{ version: string, database: Database }>({
  // Default value for the version.
  version: '1.0',

  // Use version when connecting to the database.
  database: async ({ version }, use) => {
    const db = await connectToDatabase(version);
    await use(db);
    await db.close();
  },
});
```

We can use our fixtures in the test.
```ts
// example.spec.ts
import test from './my-test';

test('test 1', async ({ database }) => {
  // Test code goes here.
});

test('test 2', async ({ version, database }) => {
  test.fixme(version === '2.0', 'This feature is not implemented in 2.0 yet');
  // Test code goes here.
});
```

Now, we can run test in multiple configurations by using projects.
```ts
// folio.config.ts
import * as folio from 'folio';

const config: folio.Config = {
  timeout: 20000,
  projects: [
    {
      name: 'v1',
      use: { version: '1.0' },
    },
    {
      name: 'v2',
      use: { version: '2.0' },
    },
  ]
};
export default config;
```

Each project can be configured separately, and run different set of tests with different parameters.
Supported options are `name`, `outputDir`, `repeatEach`, `retries`, `testDir`, `testIgnore`, `testMatch` and `timeout`. See [configuration object](#configuration-object) for detailed description.

You can run all projects or just a single one:
```sh
# Run both projects - each test will be run twice
npx folio

# Run a single project - each test will be run once
npx folio --project=v2
```

### workerInfo

Depending on the configuration and failures, Folio might use different number of worker processes to run all the tests. For example, Folio will always start a new worker process after a failing test.

Worker-scoped fixtures and `beforeAll` and `afterAll` hooks receive `workerInfo` parameter. The following information is accessible from the `workerInfo`:
- `config` - [Configuration object](#configuration-object).
- `project` - Specific [project](#projects) configuration for this worker. Different projects are always run in separate processes.
- `workerIndex: number` - A unique sequential index assigned to the worker process.

Consider an example where we run a new http server per worker process, and use `workerIndex` to produce a unique port number:

```ts
// my-test.ts
import base from 'folio';
import * as http from 'http';

// Note how we mark the fixture as { scope: 'worker' }.
// Also note that we pass empty {} first, since we do not declare any test fixtures.
const test = base.extend<{}, { server: http.Server }>({
  server: [ async ({}, use, workerInfo) => {
    // Start the server.
    const server = http.createServer();
    server.listen(9000 + workerInfo.workerIndex);
    await new Promise(ready => server.once('listening', ready));

    // Use the server in the tests.
    await use(server);

    // Cleanup.
    await new Promise(done => server.close(done));
  }, { scope: 'worker' } ]
});
export default test;
```

### testInfo

Test fixtures and `beforeEach` and `afterEach` hooks receive `testInfo` parameter. It is also available to the test function as a second parameter.

In addition to everything from the [`workerInfo`](#workerinfo), the following information is accessible before and during the test:
- `title: string` - Test title.
- `file: string` - Full path to the test file.
- `line: number` - Line number of the test declaration.
- `column: number` - Column number of the test declaration.
- `fn: Function` - Test body function.
- `repeatEachIndex: number` - The sequential repeat index.
- `retry: number` - The sequential number of the test retry (zero means first run).
- `expectedStatus: 'passed' | 'failed' | 'timedOut'` - Whether this test is expected to pass, fail or timeout.
- `timeout: number` - Test timeout.
- `annotations` - [Annotations](#annotations) that were added to the test.
- `snapshotSuffix: string` - Suffix used to locate snapshots for the test.
- `snapshotPath(snapshotName: string)` - Function that returns the full path to a particular snapshot for the test.
- `outputDir: string` - Absolute path to the output directory for this test run.
- `outputPath(...pathSegments: string[])` - Function that returns the full path to a particular output artifact for the test.

The following information is accessible after the test body has finished, in fixture teardown:
- `duration: number` - test running time in milliseconds.
- `status: 'passed' | 'failed' | 'timedOut'` - the actual test result.
- `error` - any error thrown by the test body.
- `stdout: (string | Buffer)[]` - array of stdout chunks collected during the test run.
- `stderr: (string | Buffer)[]` - array of stderr chunks collected during the test run.

Here is an example test that saves some information:
```ts
// example.spec.ts
import test from 'folio';

test('my test needs a file', async ({ table }, testInfo) => {
  // Do something with the table...
  // ... and then save contents.
  const filePath = testInfo.outputPath('table.dat');
  await table.saveTo(filePath);
});
```

Here is an example fixture that automatically saves debug logs when the test fails:
```ts
// my-test.ts
import * as debug from 'debug';
import * as fs from 'fs';
import base from 'folio';

// Note how we mark the fixture as { auto: true }.
// This way it is always instantiated, even if the test does not use it explicitly.
const test = base.extend<{ saveLogs: void }>({
  saveLogs: [ async ({}, use, testInfo) => {
    const logs = [];
    debug.log = (...args) => logs.push(args.map(String).join(''));
    debug.enable('mycomponent');
    await use();
    if (testInfo.status !== testInfo.expectedStatus)
      fs.writeFileSync(testInfo.outputPath('logs.txt'), logs.join('\n'), 'utf8');
  }, { auto: true } ]
});
export default test;
```

### Global setup and teardown

To set something up once before running all tests, use `globalSetup` option in the [configuration file](#writing-a-configuration-file). Similarly, use `globalTeardown` to run something once after all the tests.

Global setup function takes the [configuration object](#configuration-object) as a parameter. If it returns a function, this function is treated as a global teardown and will be run at the end.

```ts
// global-setup.ts
import * as http from 'http';
import app from './my-app';

async function globalSetup() {
  const server = http.createServer(app);
  await new Promise(done => server.listen(done));

  // Expose port to the tests.
  process.env.SERVER_PORT = String(server.address().port);

  // Return the global teardown function.
  return async () => {
    await new Promise(done => server.close(done));
  };
}
export default globalSetup;
```

```ts
// folio.config.ts
import * as folio from 'folio';

const config: folio.Config = {
  globalSetup: 'global-setup.ts',
};
export default config;
```

### Fixture options

It is common for the [fixtures](#fixtures) to be configurable, based on various test needs.
Folio allows creating "options" fixture for this purpose.

```ts
// my-test.ts
import base from 'folio';

const test = base.extend<{ dirCount: number, dirs: string[] }>({
  // Define an option that can be configured in tests with `test.use()`.
  // Provide a default value.
  dirCount: 1,

  // Define a fixture that provides some useful functionality to the test.
  // In this example, it will supply some temporary directories.
  // Our fixture uses the "dirCount" option that can be configured by the test.
  dirs: async ({ dirCount }, use, testInfo) => {
    const dirs = [];
    for (let i = 0; i < dirCount; i++)
      dirs.push(testInfo.outputPath('dir-' + i));

    // Use the list of directories in the test.
    await use(dirs);

    // Cleanup if needed.
  },
});
export default test;
```

We can now pass the option value with `test.use()`.

```ts
// example.spec.ts
import test from './my-test';

// Here we define the option value. Tests in this file need two temporary directories.
test.use({ dirCount: 2 });

test('my test title', async ({ dirs }) => {
  // Test can use "dirs" right away - the fixture has already run and created two temporary directories.
  test.expect(dirs.length).toBe(2);
});
```

In addition to `test.use()`, we can also specify options in the configuration file.
```ts
// folio.config.ts
import * as folio from 'folio';

const config: folio.Config = {
  // All tests will get three directories by default, unless it is overridden with test.use().
  use: { dirCount: 3 },
};
export default config;
```

### Add custom matchers using expect.extend

Folio uses [expect](https://jestjs.io/docs/expect) under the hood which has the functionality to extend it with [custom matchers](https://jestjs.io/docs/expect#expectextendmatchers). See the following example where a custom `toBeWithinRange` function gets added.

```ts
// folio.config.ts
import * as folio from 'folio';

folio.expect.extend({
  toBeWithinRange(received: number, floor: number, ceiling: number) {
    const pass = received >= floor && received <= ceiling;
    if (pass) {
      return {
        message: () => 'passed',
        pass: true,
      };
    } else {
      return {
        message: () => 'failed',
        pass: false,
      };
    }
  },
});

const config = {};
export default config;
```

```ts
// example.spec.ts
import test from 'folio';

test('numeric ranges', () => {
  test.expect(100).toBeWithinRange(90, 110);
  test.expect(101).not.toBeWithinRange(0, 100);
});
```

```ts
// global.d.ts
declare namespace folio {
  interface Matchers<R> {
    toBeWithinRange(a: number, b: number): R;
  }
}
```

To import expect matching libraries like [jest-extended](https://github.com/jest-community/jest-extended#installation) you can import it from your `globals.d.ts`:

```ts
// global.d.ts
import 'jest-extended';
```
