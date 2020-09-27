# Test fixtures

Playwright test runner is based on the concept of the [test fixtures](https://en.wikipedia.org/wiki/Test_fixture#Software). Test fixtures are used to establish environment for each test, giving the test everything it needs and nothing else.

Consider the tests below:

```ts
// hello.spec.ts
import { it, expect } from './hello.fixtures';

it('hello world', ({ hello, world }) => {
  expect(`${hello} ${world}!`).toBe('Hello World!');
});

it('hello test', ({ hello, test }) => {
  expect(`${hello} ${test}!`).toBe('Hello Test!');
});
```

Tests above use fixtures `hello`, `world` and `test` that are set up by the framework for these test runs.

Tests can use any combinations of the fixtures. For example, you can have a `server`, `auth`, `mock` fixtures. You will then declare fixtures each test needs and they will be set up for those tests.

Here is how these fixtures are defined:

```ts
// hello.fixtures.ts
import { fixtures as baseFixtures } from '@playwright/test-runner';
export { expect } from '@playwright/test-runner';

// Declare test fixtures |hello| and |world|.
type TestFixtures = {
  hello: string;
  world: string;
  test: string;
};
const fixtures = baseFixtures.declareTestFixtures<TestFixtures>();
export const it = fixtures.it;

// Define fixture |hello|.
fixtures.defineTestFixture('hello', async ({}, runTest) => {
  // Set up fixture.
  const value = 'Hello';
  // Run the test with the fixture value.
  await runTest(value);
  // Clean up fixture.
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
  ...
  helloWorld: string;
};

fixtures.defineTestFixture('helloWorld', async ({hello, world}, runTest) => {
  await runTest(`${hello} ${world}!`);
});
```

With fixtures, test organization becomes flexible - you can put tests that make sense next to each other based on what they test, not based on the environment they need.


# Worker fixtures

Playwright test runner uses worker processes to run test files. You can specify the maximum number of workers using `--jobs` command line option. Similarly to how test fixtures are set up for individual test runs, worker fixtures are set up for each worker process. That's where you can set up services, run servers, etc. Playwright test runner will reuse the worker process for as many test files as it can, provided their worker fixtures match and hence environments are identical.

Again, start with how the test looks:
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

And here is how fixtures are set up:
```ts
// express.fixtures.ts
import { fixtures as baseFixtures } from '@playwright/test-runner';
export { expect } from '@playwright/test-runner';
import express from 'express';

// Declare worker fixtures.
type ExpressWorkerFixtures = {
  port: number;
  express: any;
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
