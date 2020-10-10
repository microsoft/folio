# Parameters

- [In the command line](#in-the-command-line)
- [Generating tests](#generating-tests)

It is common to run tests in different configurations, for example when running web app tests against multiple browsers or testing two different versions of api endpoint. Playwright test runner supports this via parameters - define the parameter and start using it in a test or a fixture.

Consider the following test that uses an API url endpoint:

```ts
// api.spec.ts
import { it, expect } from './api.fixtures';
import fetch from 'node-fetch';

it('fetch 1', async ({ apiUrl }) => {
  const result = await fetch(`${apiUrl}/hello`);
  expect(await result.text()).toBe('Hello');
});
```

Here is how to define the api version parameter:

```ts
// api.fixtures.ts
import { fixtures as baseFixtures } from '@playwright/test-runner';
export { expect } from '@playwright/test-runner';

const fixtures = baseFixtures
    .defineParameter('version', 'API version', 'v1')
    .defineWorkerFixtures<{ apiUrl: string }>({
      apiUrl: async ({ version }, runTest) => {
        const server = await startServer();
        await runTest(`http://localhost/api/${version}`);
        await server.close();
      }
    });
export const it = fixtures.it;
```

## In the command line

Given the example above, it is possible to run tests against the specific api version.

TODO: do not assume this is read top-bottom, each section should be self-contained

TODO: update the npx command.

```sh
# Run against the default version (v1 in our case).
npx test-runner tests
# Run against the specified version.
npx test-runner tests -p version=v2
```

## Generating tests

TODO: do not assume this is read top-bottom, each section should be self-contained

It is also possible to run tests against multiple api versions.

```ts
// api.fixtures.ts

// Generate three versions of each test that directly or indirectly
// depends on the |version| parameter.
fixtures.generateParametrizedTests('version', ['v1', 'v2', 'v3']);
```

TODO: update the npx command.

```sh
npx test-runner tests -p version=v1 -p version=v2
```
