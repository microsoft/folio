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

import { fixtures } from '../..';
const { it, fit, expect, describe, fdescribe } = fixtures;

it('included test', () => {
  expect(1 + 1).toBe(3);
});

fit('focused test', () => {
  expect(1 + 1).toBe(2);
});

it.only('focused only test', () => {
  expect(1 + 1).toBe(2);
});

fdescribe('focused describe', () => {
  it('describe test', () => {
    expect(1 + 1).toBe(2);
  });
});

describe('non-focused describe', () => {
  it('describe test', () => {
    expect(1 + 1).toBe(3);
  });
});

describe.only('focused describe', () => {
  it('describe test', () => {
    expect(1 + 1).toBe(2);
  });
});
