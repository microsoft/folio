## Migration from version 0.3.18

### Test syntax

Instead of passing around `folio` objects, you now pass the `test` function directly. There is no need to destructure methods from it. Hooks, `expect` and `describe` blocks are available on the `test` function.

```ts
// Old syntax
import { folio } from 'folio';
const { it, expect, beforeEach } = folio;
beforeEach(() => {});
it('should work', () => {
  expect(1 + 1).toBe(2);
});

// New syntax
import test from 'folio';
test.beforeEach(() => {});
test('should work', () => {
  test.expect(1 + 1).toBe(2);
});

// Alternatively
import { test, expect } from 'folio';
test.beforeEach(() => {});
test('should work', () => {
  expect(1 + 1).toBe(2);
});
```

### Extend syntax

Instead of calling methods on `fixtures`, pass an object with fixture definitions.

```ts
// Old syntax
const fixtures = base.extend<{ foo: string }>();
fixtures.foo.init(async ({}, run) => {
  const value = await createTheValue();
  await run(value);
  await disposeTheValue(value);
});
export const folio = fixtures.build();

// New syntax
export const test = base.extend<{ foo: string }>({
  foo: async ({}, use) => {
    const value = await createTheValue();
    await use(value);
    await disposeTheValue(value);
  },
});
```

### Fixture syntax

Minor changes in the fixture syntax:

- You can now pass fixture value directly
  ```ts
  export const test = base.extend<{ foo: string }>({
    foo: 'value',
  });
  ```

- To pass fixture options like `scope` or `auto`, use a tuple syntax:
  ```ts
  export const test = base.extend<{}, { foo: string }>({
    foo: [ async ({}, use) => {
      await use('value');
    }, { scope: 'worker', auto: true } ],
  });
  ```

### testInfo, testWorkerIndex

`testInfo` is now a separate parameter both in tests and fixtures:

```ts
// Old syntax
it('should work', async ({ myFixture, testInfo, testWorkerIndex }) => {
});

// New syntax
test('should work', async ({ myFixture }, testInfo) => {
  // TestInfo now encapsulates all the information
  const testWorkerIndex = testInfo.workerIndex;
});
```

### New: configuration file

You can now put your configuration to a file.

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

Learn more in [writing a configuration file](../README.md#writing-a-configuration-file) section.

### New: passing options to fixtures

With the combination of `test.use()` and `use` section in the configuration file, you can easily customize your fixtures.

```ts
// my.spec.ts
import base from 'folio';
const test = base.extend<{ name: string, greeting: string }>({
  // "option" fixture, with a default value
  name: 'world',

  // "actual" fixture, with some logic
  greeting: async ({ name }, use) => {
    await use(`Hello, ${name}!`);
  },
});

// Use a value for this file.
test.use({ name: 'Folio' });
test('should be Folio', async ({ greeting }) => {
  test.expect(greeting).toBe('Hello, Folio!');
});

test.describe('suite', () => {
  // Use a value for this suite.
  test.use({ name: 'New Folio' });
  test('should be New Folio', async ({ greeting }) => {
    test.expect(greeting).toBe('Hello, New Folio!');
  });
});
```

A different default value in the configuration file:
```ts
// folio.config.ts
module.exports = {
  use: { name: 'Different Name' },
};
```

Learn more in [fixture options](../README.md#fixture-options) section.

### Parameters

Parameters are replaced by projects. Instead of defining a parameter with a default value and generating parametrized tests, you can now define multiple projects in the configuration file.

```ts
// Old syntax
const fixtures = base.extend<{}, {}, { version: string }>();
fixtures.version.initParameter('API version', 'v1');
export const folio = fixtures.build();
folio.generateParametrizedTests('version', ['v1', 'v2']);
```

```ts
// New syntax, my.spec.ts
export const test = base.extend<{ version: string }>({
  version: 'v1',
});


// New syntax, folio.config.ts
module.exports = {
  projects: [
    {
      name: 'version 1.0',
      use: { version: 'v1' },
    },
    {
      name: 'version 2.0',
      use: { version: 'v2' },
    },
  ]
};
```

Learn more in [projects](../README.md#projects) section.
