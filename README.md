# Folio ![npm](https://img.shields.io/npm/v/folio)

A customizable test framework to build your own test frameworks. Foundation for the [Playwright test runner](https://github.com/microsoft/playwright-test).

Folio is **available in preview** and is under active development. Breaking changes could happen. We welcome your feedback to shape this towards 1.0.

## Docs

- [Isolation and flexibility](#isolation-and-flexibility)
- [Writing a test](#writing-a-test)
- [Writing a configuration file](#writing-a-configuration-file)
- [Creating an environment](#creating-an-environment)
- [Command line](#command-line)
- [Snapshots](#snapshots)
- [Annotations](#annotations)
  - [Flaky tests](#flaky-tests)
- [Parallelism and sharding](#parallelism-and-sharding)
  - [Workers](#workers)
  - [Shards](#shards)
- [Advanced configuration](#advanced-configuration)
  - [Configuration object](#configuration-object)
  - [Changing the timeout](#changing-the-timeout)
  - [workerInfo](#workerinfo)
  - [testInfo](#testinfo)
  - [Multiple test types and configurations](#multiple-test-types-and-configurations)
  - [Global setup and teardown](#global-setup-and-teardown)
  - [Test options](#test-options)
- [Reporters](#reporters)
  - [Built-in reporters](#built-in-reporters)
  - [Reporter API](#reporter-api)
- [Expect](#expect)
  - [Add custom matchers using expect.extend](#add-custom-matchers-using-expectextend)

## Isolation and flexibility

Folio focuses on test isolation and flexibility. This makes it fast, reliable and able to adapt to your specific needs.

**Isolation**. Tests are isolated by default and can be run independently.

- Folio runs tests in parallel by default, making your test suite much faster. Thanks to isolation, Folio reuses processes for multiple tests, suites and file, which makes it even faster.

- Flaky tests can be retried without significant overhead, because Folio will only retry the failures, and not the whole suite.

- Refactoring tests and moving them around is effortless, since isolated tests do not have inter-dependencies.

- You can group tests based on their meaning, instead of their common setup.

**Flexibility**. Folio includes advanced features, adapting to your specific testing needs.

- Leverage TypeScript power with minimal effort.

- Run tests in multiple configurations.

- Annotate tests as skipped/failed based on configuration.

- Generate comprehensive report with your custom test annotations.

- Define multiple test types, for example slow tests or smoke tests, and run them differently.

## Writing a test

Folio follows the traditional BDD style. However, each test in Folio receives an object with Test Arguments. These arguments are isolated from other tests, which gives Folio [numerous advantages](#isolation-and-flexibility).

```ts
test('insert an entry', async ({ table }) => {
  await table.insert({ username: 'folio', password: 'testing' });
  const entry = await table.query({ username: 'folio' });
  expect(entry.password).toBe('testing');
});
```

In the test above, `table` is a database table created for each test, so multiple tests running in parallel won't step on each other's toes.

Folio uses `expect` library for test assertions.

## Writing a configuration file

Folio requires a configuration file that specifies how to run the tests.
```ts
// folio.config.ts

import * as folio from 'folio';

// Configure Folio to look for tests in this directory, and give each test 20 seconds.
folio.setConfig({ testDir: __dirname, timeout: 20000 });

// Create a test type. For the easiest setup, you can use a default one.
export const test = folio.test;

// Run tests with two retries.
test.runWith({ tag: 'basic', retries: 2 });
```

Now, use the created test type in your tests.
```ts
// math.spec.ts

import { test } from './folio.config';

test('check the addition', () => {
  test.expect(1 + 1).toBe(42);
});
```

You can run tests with Folio [command line](#command-line):
```sh
$ npx folio --reporter=dot
Running 1 test using 1 worker
××F
 1 failed
```

## Creating an environment

Usually, you need some test environment to run the tests. That may be a test database, dev server, mock user data, or anything else the test needs. Folio support creating an environment that is going to be used for multiple tests.

Let's see how to add an environment, based on the example from [writing a configuration file](#writing-a-configuration-file) section.

```ts
// folio.config.ts

import * as folio from 'folio';

folio.setConfig({ testDir: __dirname, timeout: 20000 });

class DatabaseEnv {
  database: Database;
  table: DatabaseTable;

  async beforeAll() {
    // Connect to a database once, it is expensive.
    this.database = await connectToTestDatabase();
  }

  async beforeEach() {
    // Create a new table for each test and return it.
    this.table = await this.database.createTable();
    // Anything returned from this method is available to the test. In our case, "table".
    return { table: this.table };
  }

  async afterEach() {
    // Do not leave extra tables around.
    await this.table.drop();
  }

  async afterAll() {
    await this.database.disconnect();
  }
}

// Our test type comes with the database environment, so each test can use a "table" argument.
export const test = folio.test.extend(new DatabaseEnv());

// Run our tests.
test.runWith({ tag: 'database' });
```

In this example we see that tests use an environment that provides arguments to the test.

Folio uses worker processes to run test files. You can specify the maximum number of workers using `--workers` command line option. By using `beforeAll` and `afterAll` methods, environment can set up expensive resources to be shared between tests in each worker process. Folio will reuse the worker process for as many test files as it can, provided their environments match.

## Annotations

Unfortunately, tests do not always pass. Folio supports test annotations to deal with failures, flakiness and tests that are not yet ready.

```ts
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

## Command line

Just point Folio to your [configuration file](#writing-a-configuration-file).
```sh
$ npx folio --config=my.config.ts
```

Arguments passed to `npx folio` are treated as a filter for test files. For example, `npx folio my-spec` will only run tests from files with `my-spec` in the name.

Below is a list of command line options:
- `--config <file>`: Configuration file. Defaults to `folio.config.ts` or `folio.config.js` in the current directory.
- `--forbid-only`: Whether to disallow `test.only` exclusive tests. Useful on CI. Overrides `config.forbidOnly` option from the configuration file.
- `--global-timeout <number>`: Total timeout in milliseconds for the whole test run. By default, there is no global timeout. Overrides `config.globalTimeout` option from the configuration file.
- `--grep <grep>` or `-g <grep>`: Only run tests matching this regular expression, for example `/my.*test/i` or `my-test`. Overrides `config.grep` option from the configuration file.
- `--help`: Display help.
- `--list`: List all the tests, but do not run them.
- `--max-failures <N>` or `-x`: Stop after the first `N` test failures. Passing `-x` stops after the first failure. Overrides `config.maxFailures` option from the configuration file.
- `--output <dir>`: Directory for artifacts produced by tests, defaults to `test-results`. Overrides `config.outputDir` option from the configuration file.
- `--quiet`: Whether to suppress stdout and stderr from the tests. Overrides `config.quiet` option from the configuration file.
- `--repeat-each <number>`: Specifies how many times to run each test. Defaults to one. Overrides `config.repeatEach` option from the configuration file.
- `--reporter <reporter>`. Specify reporter to use, comma-separated, can be some combination of `dot`, `json`, `junit`, `line`, `list` and `null`. See [reporters](#reporters) for more information.
- `--retries <number>`: The maximum number of retries for each [flaky test](#flaky-tests), defaults to zero (no retries). Overrides `config.retries` option from the configuration file.
- `--shard <shard>`: [Shard](#shards) tests and execute only selected shard, specified in the form `current/all`, 1-based, for example `3/5`. Overrides `config.shard` option from the configuration file.
- `--snapshot-dir <dir>`: [Snapshots](#snapshots) directory, relative to tests directory. Defaults to `__snapshots__`. Overrides `config.snapshotDir` option from the configuration file.
- `--tag <tag...>`: Only run tests tagged with one of the specified tags. Defaults to running all available tags that are defined in the [configuration file](#writing-a-configuration-file).
- `--test-dir <dir>`: Directory where Folio should search for tests, defaults to current directory. Only files matching `--test-match` are recognized as test files. Overrides `config.testDir` option from the configuration file.
- `--test-ignore <pattern>`: Pattern used to ignore test files, defaults to `node_modules`. Either a regular expression (for example, `/node_modules/`) or a glob pattern (for example, `**/ignore-dir/*`). Overrides `config.testIgnore` option from the configuration file.
- `--test-match <pattern>`: Pattern used to find test files, defaults to files ending with `.spec.js`, `.test.js`, `.spec.ts` or `.test.ts`. Either a regular expression (for example, `/my-test-\d+/i`) or a glob pattern (for example, `?(*.)+(spec|test).[jt]s`). Overrides `config.testMatch` option from the configuration file.
- `--timeout <number>`: Maximum timeout in milliseconds for each test, defaults to 10 seconds. Overrides `config.timeout` option from the configuration file.
- `--update-snapshots` or `-u`: Whether to update snapshots with actual results instead of comparing them. Use this when snapshot expectations have changed. Overrides `config.updateSnapshots` option from the configuration file.
- `--workers <workers>` or `-j <workers>`: The maximum number of concurrent worker processes.  Overrides `config.workers` option from the configuration file.


## Snapshots

Folio includes the ability to produce and compare snapshots. For that, use `expect().toMatchSnapshot()`. Folio auto-detects the content type, and includes built-in matchers for text, png and jpeg images, and arbitrary binary data.

```ts
test('my test', async () => {
  const image = await produceSomePNG();
  expect(image).toMatchSnapshot('optional-snapshot-name.png');
});
```

Snapshots are stored under `__snapshots__` directory by default, configurable via [command line](#command-line) or [configuration object](#configuration-object).

## Parallelism and sharding

Folio runs tests in parallel by default, using multiple worker processes.

### Workers

Each worker process creates a new environment to run tests. Different environments always run in different workers. By default, Folio reuses the worker as much as it can to make testing faster, but it will create a new worker when retrying tests, after any test failure, to initialize a new environment, or just to speed up test execution if the worker limit is not reached.

The maximum number of worker processes is controlled via [command line](#command-line) or [configuration object](#configuration-object).

Each worker process is assigned a unique sequential index that is accessible through [`workerInfo`](#workerinfo) object.

### Shards

Folio can shard a test suite, so that it can be executed on multiple machines. For that,  pass `--shard=x/y` to the command line. For example, to split the suite into three shards, each running one third of the tests:
```sh
$ npx folio --shard=1/3
$ npx folio --shard=2/3
$ npx folio --shard=3/3
```

## Advanced configuration

### Configuration object

Configuration file uses `setConfig` function to provide a global configuration to Folio. It may contain the following properties:
- `forbidOnly: boolean` - Whether to disallow `test.only` exclusive tests. Useful on CI. Overridden by `--forbid-only` command line option.
- `globalTimeout: number` - Total timeout in milliseconds for the whole test run. Overridden by `--global-timeout` command line option.
- `grep: RegExp | RegExp[]` - Patterns to filter tests based on their title. Overridden by `--grep` command line option.
- `maxFailures: number` - Stop testing after reaching the maximum number of failures.  Overridden by `--max-failures` command line option.
- `outputDir: string` - Directory to place any artifacts produced by tests. Overridden by `--output` command line option.
- `quiet: boolean` - Whether to suppress stdout and stderr from the tests. Overridden by `--quiet` command line option.
- `repeatEach: number` - Each test will be repeated multiple times. Overridden by `--repeat-each` command line option.
- `retries: number` - Maximum number of retries. Overridden by `--retries` command line option.
- `shard: { total: number, current: number } | null` - [Shard](#shards) information. Overridden by `--shard` command line option.
- `snapshotDir: string` - [Snapshots](#snapshots) directory, relative to tests directory. Overridden by `--snapshot-dir` command line option.
- `testDir: string` - Directory where Folio should search for tests. Overridden by `--test-dir` command line option.
- `testIgnore: string | RegExp | (string | RegExp)[]` - Patterns to ignore test files. Overridden by `--test-ignore` command line option.
- `testMatch: string | RegExp | (string | RegExp)[]` - Patterns to match test files. Overridden by `--test-match` command line option.
- `timeout: number` - Test timeout in milliseconds. Overridden by `--timeout` command line option.
- `updateSnapshots: boolean` - Whether to update snapshots instead of comparing them. Overridden by `--update-snapshots` command line option.
- `workers: number` - The maximum number of concurrent worker processes. Overridden by `--workers` command line option.

```ts
// folio.config.ts

import * as folio from 'folio';

folio.setConfig({
  // Typically, you'd place folio.config.ts in the tests directory.
  testDir: __dirname,
  // 20 seconds per test.
  timeout: 20000,
  // Forbid test.only on CI.
  forbidOnly: !!process.env.CI,
  // Two retries for each test.
  retries: 2,
});
```

### Changing the timeout

There are a few ways to change the test timeout - the amount of time in milliseconds per each test. Passing a zero timeout in any of these disables the timeout.

- Using [`setConfig`](#configuration-object) and passing a `timeout` property.
```js
setConfing({
  testDir: __dirname,
  // Each test gets 5 seconds.
  timeout: 5000,
});
```

- Using `--timeout` [command line](#command-line) option.
```sh
# Disable timeout for all tests, e.g. for debugging.
$ npx folio --config=config.ts --timeout=0
```

- Calling `test.setTimeout(milliseconds)` from the test itself.
```js
test('my test', async () => {
  // Give this test 5 seconds.
  test.setTimeout(5000);
});
```

- Calling `test.slow()` to triple the timeout.
```js
test('my test', async () => {
  test.slow('this dataset is too large');
});
```


### workerInfo

Depending on the configuration and failures, Folio might use different number of worker processes to run all the tests. For example, Folio will always start a new worker process after a failing test.

Environment and hooks receive `workerInfo` in the `beforeAll` and `afterAll` calls. The following information is accessible from the `workerInfo`:
- `config` - [Configuration object](#configuration-object).
- `workerIndex: number` - A unique sequential index assigned to the worker process.

Consider an example where we run a new http server per worker process, and use `workerIndex` to produce a unique port number:

```ts
import * as http from 'http';

class ServerEnv {
  server: http.Server;

  async beforeAll(workerInfo) {
    this.server = http.createServer();
    this.server.listen(9000 + workerInfo.workerIndex);
    await new Promise(ready => this.server.once('listening', ready));
  }

  async beforeEach() {
    // Provide the server as a test argument.
    return { server: this.server };
  }

  async afterAll() {
    await new Promise(done => this.server.close(done));
  }
}
```

### testInfo

Environment and hooks receive `testInfo` in the `beforeEach` and `afterEach` calls. It is also available to the test function as a second parameter.

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
- `data: object` - Any additional data that you'd like to attach to the test, it will appear in the report.
- `snapshotPathSegment: string` - Relative path, used to locate snapshots for the test.
- `snapshotPath(...pathSegments: string[])` - Function that returns the full path to a particular snapshot for the test.
- `outputDir: string` - Absolute path to the output directory for this test run.
- `outputPath(...pathSegments: string[])` - Function that returns the full path to a particular output artifact for the test.

The following information is accessible after the test body has finished, in `afterEach`:
- `duration: number` - test running time in milliseconds.
- `status: 'passed' | 'failed' | 'timedOut'` - the actual test result.
- `error` - any error thrown by the test body.
- `stdout: (string | Buffer)[]` - array of stdout chunks collected during the test run.
- `stderr: (string | Buffer)[]` - array of stderr chunks collected during the test run.

Here is an example test that saves some information:
```ts
test('my test needs a file', async ({ table }, testInfo) => {
  // Do something with the table...
  // ... and then save contents.
  const filePath = testInfo.outputPath('table.dat');
  await table.saveTo(filePath);
});
```

Here is an example environment that automatically saves debug logs when the test fails:
```ts
import * as debug from 'debug';
import * as fs from 'fs';

class LogEnv {
  async beforeEach() {
    this.logs = [];
    debug.log = (...args) => this.logs.push(args.map(String).join(''));
    debug.enable('mycomponent');
  }

  async afterEach(testInfo) {
    if (testInfo.status !== testInfo.expectedStatus)
      fs.writeFileSync(testInfo.outputPath('logs.txt'), this.logs.join('\n'), 'utf8');
  }
}
```

### Multiple test types and configurations

Often times there is a need for different kinds of tests, for example generic tests that use a database table, or some specialized tests that require more elaborate setup. It is also common to run tests in multiple configurations. Folio allows you to configure everything by writing code for maximum flexibility.

Instead of using `test.extend()` to add an environment right away, we use `test.declare()` to declare the test arguments and `test.runWith()` to give it the actual environment and configuration.

```ts
// folio.config.ts

import * as folio from 'folio';
import * as fs from 'fs';

// 20 seconds timeout, 3 retries by default.
folio.setConfig({ testDir: __dirname, timeout: 20000, retries: 3 });

// Environment with some test value.
class MockedEnv {
  async beforeEach() {
    return { value: 'some test value' };
  }
}

// Another environment that reads from a file.
class FileEnv {
  constructor() {
    this.value = fs.readFileSync('data.txt', 'utf8');
  }
  async beforeEach() {
    return { value: this.value };
  }
}

// Our tests need a common string value.
const valueTest = folio.test.declare<{ value: string }>();

// Now declare as many test types as we'd like.

// Run generic tests with two different environments and no specific configuration.
export const test = valueTest.declare();
test.runWith(new MockedEnv());
test.runWith(new FileEnv());

// Run slow tests with increased timeout, in a single environment.
export const slowTest = valueTest.declare();
slowTest.runWith(new MockedEnv(), { timeout: 100000 });

// Run smoke tests without retries - these must not be flaky.
// Adding a tag allows to run just the smoke tests with `npx folio --tag=smoke`.
export const smokeTest = valueTest.declare();
smokeTest.runWith(new MockedEnv(), { retries: 0, tag: 'smoke' });

// These tests also get a "foo" argument.
export const fooTest = valueTest.extend({
  beforeEach() {
    return { foo: 42 };
  }
});
// Although we already added the environment that gives "foo", we still have to provide
// the "value" declared in valueTest.
fooTest.runWith(new MockedEnv(), { tag: 'foo' });
```

We can now use our test types to write tests:
```ts
// some.spec.ts

import { test, slowTest, smokeTest, fooTest } from './folio.config';

test('just a test', async ({ value }) => {
  // This test will be retried.
  expect(value).toBe('wrong value');
});

slowTest('does a lot', async ({ value }) => {
  for (let i = 0; i < 100000; i++)
    expect(value).toBe('some test value');
});

smokeTest('a smoke test', async ({ value }) => {
  // This test will not be retried.
  expect(value).toBe('some test value');
});

fooTest('a smoke test', async ({ foo }) => {
  // Note the different test arguments.
  expect(foo).toBe(42);
});
```

### Global setup and teardown

To set something up once before running all tests, use `globalSetup` hook in the [configuration file](#writing-a-configuration-file). Similarly, use `globalTeardown` to run something once after all the tests.

```ts
// folio.config.ts

import * as folio from 'folio';
import * as app from '../my-app';
import * as http from 'http';

let server: http.Server;

folio.globalSetup(async () => {
  server = http.createServer(app);
  await new Promise(done => server.listen(done));
  process.env.SERVER_PORT = String(server.address().port); // Expose port to the tests.
});

folio.globalTeardown(async () => {
  await new Promise(done => server.close(done));
});

folio.setConfig({ testDir: __dirname });
export const test = folio.newTestType();
test.runWith();
```

### Test options

It is common for [test environment](#creating-an-environment) to be configurable, based on various test needs. There are three different ways to configure environment in Folio, depending on the usecase.

#### Creating multiple environment instances

Use this method when you need to run tests in multiple configurations. See [Multiple test types and configurations](#multiple-test-types-and-configurations) for more details.

```ts
// folio.config.ts

import * as folio from 'folio';

folio.setConfig({ testDir: __dirname });

// This environment provides a "hello".
class HelloEnv {
  constructor(name) {
    this.name = name;
  }

  async beforeEach() {
    return { hello: `Hello, ${this.name}!` };
  }
}

// Tests expect a "hello" value.
export const test = folio.test.declare<{ hello: string }>();

// Now, run tests in two configurations.
test.runWith(new HelloEnv('world'));
test.runWith(new HelloEnv('test'));
```

#### Providing function as a test argument

Use this method when you need to alter the environment for some tests.

Define the function provided by environment. In our case, this will be `createHello` function.
```ts
// folio.config.ts

import * as folio from 'folio';

folio.setConfig({ testDir: __dirname });

// This environment provides a function "createHello".
class CreateHelloEnv {
  async beforeEach() {
    return { createHello: (name: string) => `Hello, ${name}!` };
  }
}

// Tests get a "createHello" function.
export const test = folio.test.extend(new CreateHelloEnv());
test.runWith();
```

Now use this function in the test.
```ts
// some.spec.ts

import { test } from './folio.config';
import { expect } from 'folio';

test('my test', ({ createHello }) => {
  expect(createHello('world')).toBe('Hello, world!');
});
```

#### Specifying options with `test.useOptions`

Use this method when you have common configuration that needs to often change between tests.

```ts
// folio.config.ts

import * as folio from 'folio';

folio.setConfig({ testDir: __dirname });

// This environment provides a "hello".
class HelloEnv {
  // Declare the TestOptions type.
  testOptionsType(): { name?: string } {
    return {} as any;  // It does not matter what you return from here.
  }

  // Use TestOptions in beforeEach.
  async beforeEach({ name }, testInfo: folio.TestInfo) {
    // Don't forget to account for missing "name".
    return { hello: `Hello, ${name || ''}!` };
  }
}

// Tests expect a "hello" value, and can provide a "name" option.
export const test = folio.test.extend(new HelloEnv());
test.runWith();
```

Now specify the options in the test file with `test.useOptions`. It works for each test in the file, or the containing `test.describe` block if any, similar to `test.beforeEach` and other hooks.
```ts
// some.spec.ts

import { test } from './folio.config';
import { expect } from 'folio';

test.useOptions({ name: 'world' });
test('my test with options', ({ hello }) => {
  expect(hello).toBe('Hello, world!');
});
test('another test, same options', ({ hello }) => {
  expect(hello).toBe('Hello, world!');
});

test.describe('this suite uses different options', () => {
  test.useOptions({ name: 'test' });
  test('different options', ({ hello }) => {
    expect(hello).toBe('Hello, test!');
  });
});
```

## Reporters

Folio comes with a few built-in reporters for different needs and ability to provide custom reporters. The easiest way to try out built-in reporters is `--reporter` [command line option](#command-line).

```sh
$ npx folio --config=config.ts --reporter=list
```

For more control, you can specify reporters programmatically in the [configuration file](#writing-a-configuration-file).

```ts
// folio.config.ts

import * as folio from 'folio';

// A long list of tests for the terminal.
folio.setReporters([ new folio.reporters.list() ]);

if (process.env.CI) {
  // Entirely different config on CI.
  // Use very concise "dot" reporter plus a comprehensive json report.
  folio.setReporters([
    new folio.reporters.dot(),
    new folio.reporters.json({ outputFile: 'test-results.json' }),
  ]);
}
```

### Built-in reporters

All built-in reporters show detailed information about failures, and mostly differ in verbosity for successful runs.

#### Line reporter

Line reporter is default. It uses a single line to report last finished test, and prints failures when they occur. Line reporter is useful for large test suites where it shows the progress but does not spam the output by listing all the tests. Use it with `--reporter=line` or `new folio.reporters.line()`.

Here is an example output in the middle of a test run. Failures are reporter inline.
```sh
$ npm run test -- --reporter=line
Running 124 tests using 6 workers
  1) dot-reporter.spec.ts:20:1 › render expected ===================================================

    Error: expect(received).toBe(expected) // Object.is equality

    Expected: 1
    Received: 0

[23/124] gitignore.spec.ts - should respect nested .gitignore
```

#### List reporter

List reporter is verbose - it prints a line for each test being run. Use it with `--reporter=list` or `new folio.reporters.list()`.

Here is an example output in the middle of a test run. Failures will be listed at the end.
```sh
$ npm run test -- --reporter=list
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

#### Dot reporter

Dot reporter is very concise - it only produces a single character per successful test run. It is useful on CI where you don't want a lot of output. Use it with `--reporter=dot` or `new folio.reporters.dot()`.

Here is an example output in the middle of a test run. Failures will be listed at the end.
```sh
$ npm run test -- --reporter=dot
Running 124 tests using 6 workers
······F·············································
```

#### JSON reporter

JSON reporter produces an object with all information about the test run. It is usually used together with some terminal reporter like `dot` or `line`.

You would usually want to output JSON into a file. When running with `--reporter=json`, use `FOLIO_JSON_OUTPUT_NAME` environment variable:
```sh
$ FOLIO_JSON_OUTPUT_NAME=results.json npm run test -- --reporter=json,dot
```
With `setReporters` call, pass options to the constructor:
```ts
folio.setReporters([
  new folio.reporters.json({ outputFile: 'results.json' })
]);
```

#### JUnit reporter

JUnit reporter produces a JUnit-style xml report. It is usually used together with some terminal reporter like `dot` or `line`.

You would usually want to output into an xml file. When running with `--reporter=junit`, use `FOLIO_JUNIT_OUTPUT_NAME` environment variable:
```sh
$ FOLIO_JUNIT_OUTPUT_NAME=results.xml npm run test -- --reporter=junit,line
```
With `setReporters` call, pass options to the constructor:
```ts
folio.setReporters([
  new folio.reporters.junit({ outputFile: 'results.xml' })
]);
```

## Expect

### Add custom matchers using expect.extend

Folio uses [expect](https://jestjs.io/docs/expect) under the hood which has the functionality to extend it with [custom matchers](https://jestjs.io/docs/expect#expectextendmatchers). See the following example where a custom `toBeWithinRange` function gets added.

<details>
  <summary>folio.config.ts</summary>

```ts
import * as folio from 'folio';

folio.setConfig({ testDir: __dirname, timeout: 30 * 1000 });

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

folio.test.runWith();
```
</details>

<details>
  <summary>example.spec.ts</summary>

```ts
import { expect, test } from 'folio';

test('numeric ranges', () => {
  expect(100).toBeWithinRange(90, 110);
  expect(101).not.toBeWithinRange(0, 100);
});
```
</details>

<details>
  <summary>global.d.ts</summary>

```ts
declare namespace folio {
  interface Matchers<R> {
    toBeWithinRange(a: number, b: number): R;
  }
}
```
</details>

To import expect matching libraries like [jest-extended](https://github.com/jest-community/jest-extended#installation) you can import it from your `globals.d.ts`:

```ts
import 'jest-extended';
```
