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

Error.stackTraceLimit = 15;

export type Implementation = {
  it: any;
  describe: any;
  beforeEach: (fn: Function) => void;
  afterEach: (fn: Function) => void;
  beforeAll: (fn: Function) => void;
  afterAll: (fn: Function) => void;
};

let implementation: Implementation;

export const it = (...args) => {
  implementation.it('default', ...args);
};
it.skip = (...args) => implementation.it('skip', ...args);
it.only = (...args) => implementation.it('only', ...args);

export const describe = (...args) => {
  implementation.describe('default', ...args);
};
describe.skip = (...args) => implementation.describe('skip', ...args);
describe.only = (...args) => implementation.describe('only', ...args);

export const beforeEach = fn => implementation.beforeEach(fn);
export const afterEach = fn => implementation.afterEach(fn);
export const beforeAll = fn => implementation.beforeAll(fn);
export const afterAll = fn => implementation.afterAll(fn);

export function setImplementation(i: Implementation) {
  implementation = i;
}
