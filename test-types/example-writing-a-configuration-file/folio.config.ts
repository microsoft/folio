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
import * as fs from 'fs';

import * as folio from '../../out';

// 20 seconds timeout, 3 retries by default.
folio.setConfig({ testDir: __dirname, timeout: 20000, retries: 3 });

// Define as many test types as you'd like:
// - Generic test that only needs a string value.
export const test = folio.newTestType<{ value: string }>();
// - Slow test for extra-large data sets.
export const slowTest = folio.newTestType<{ value: string }>();
// - Smoke tests should not be flaky.
export const smokeTest = folio.newTestType<{ value: string }>();
// - Some special tests that require different arguments.
export const fooTest = folio.newTestType<{ foo: number }>();

export const expect = folio.expect;

// Environment with some test value.
class MockedEnv {
  async beforeEach() {
    return { value: 'some test value' };
  }
}

// Another environment that reads from file.
class FileEnv {
  value: string;
  constructor() {
    this.value = fs.readFileSync('data.txt', 'utf8');
  }
  async beforeEach() {
    return { value: this.value };
  }
}

// This environment provides foo.
class FooEnv {
  async beforeEach() {
    return { foo: 42 };
  }
}

// Now we can run tests in different configurations:
// - Generics tests with two different environments.
test.runWith(new MockedEnv());
test.runWith(new FileEnv());
// - Increased timeout for slow tests.
slowTest.runWith(new MockedEnv(), { timeout: 100000 });
// - Smoke tests without retries.
//   Adding a tag allows to run just the smoke tests with `npx folio --tag=smoke`.
smokeTest.runWith(new MockedEnv(), { retries: 0, tag: 'smoke' });
// - Special foo tests need a different environment.
fooTest.runWith(new FooEnv());