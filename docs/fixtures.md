# Fixtures

- [Basic concepts](#basic-concepts)
- [Test fixtures](#test-fixtures)
- [Worker fixtures](#worker-fixtures)
- [Built-in fixtures](#built-in-fixtures)
  - [testWorkerIndex](#testworkerindex)
  - [testInfo](#testinfo)

## Basic concepts

Playwright test runner is based on the concept of the test fixtures. Test fixtures are used to establish environment for each test, giving the test everything it needs and nothing else. Here is how typical test environment setup differs between traditional BDD and the fixture-based one:

**Without fixtures**

```ts
describe('database', () => {
  let database;
  let table;

  beforeAll(() => {
    database = connect();
  });

  afterAll(() => {
    database.dispose();
  });

  beforeEach(()=> {
    table = database.createTable();
  });

  afterEach(()=> {
    database.dropTable(table);
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

**With fixtures**

```ts
import { it } from './db.fixtures';

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

## Test fixtures

Test fixtures are set up for each test. Consider the following test file:

```ts
// hello.spec.ts
import { it, expect } from './hello.fixtures';

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
// hello.fixtures.ts
import { fixtures as baseFixtures } from '@playwright/test-runner';
export { expect } from '@playwright/test-runner';

// For types: Declare test fixtures |hello|, |world| and |test|.
type TestFixtures = {
  hello: string;
  world: string;
  test: string;
};
const fixtures = baseFixtures.declareTestFixtures<TestFixtures>();
export const it = fixtures.it;

// Define fixture |hello|.
fixtures.defineTestFixture('hello', async ({}, runTest) => {
  const value = 'Hello'; // Set up fixture.
  await runTest(value); // Run the test with the fixture value.
  // Optionally, clean up fixture.
});

fixtures.defineTestFixture('world', async ({}, runTest) => {
  await runTest('World');
});

fixtures.defineTestFixture('test', async ({}, runTest) => {
  await runTest('Test');
});
```

Fixtures can use other fixtures.

```ts
type TestFixtures = {
  // ...
  helloWorld: string;
};

fixtures.defineTestFixture('helloWorld', async ({hello, world}, runTest) => {
  await runTest(`${hello}, ${world}!`);
});
```

With fixtures, test organization becomes flexible - you can put tests that make sense next to each other based on what they test, not based on the environment they need.


## Worker fixtures

Playwright test runner uses worker processes to run test files. You can specify the maximum number of workers using `--jobs` command line option. Similarly to how test fixtures are set up for individual test runs, worker fixtures are set up for each worker process. That's where you can set up services, run servers, etc. Playwright test runner will reuse the worker process for as many test files as it can, provided their worker fixtures match and hence environments are identical.

Here is how the test looks:
```ts
// express.spec.ts
import { it, expect } from './express.fixtures';
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
// express.fixtures.ts
import { fixtures as baseFixtures } from '@playwright/test-runner';
export { expect } from '@playwright/test-runner';
import express from 'express';
import type { Express } from 'express';

// For types: Declare worker fixtures.
type ExpressWorkerFixtures = {
  port: number;
  express: Express;
};
const fixtures = baseFixtures.declareWorkerFixtures<ExpressWorkerFixtures>();
export const it = fixtures.it;

// Define |port| fixture that has unique value value of the worker process index.
fixtures.defineWorkerFixture('port', async ({ testWorkerIndex }, runTest) => {
  await runTest(3000 + testWorkerIndex);
});

// Define the express worker fixture, make it start automatically for every worker.
fixtures.defineWorkerFixture('express', async ({ port }, runTest) => {
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
  await runTest(server);
  console.log('Stopping server...');
  await new Promise(f => server.close(f));
  console.log('Server stopped');
}, { auto: true });
```
