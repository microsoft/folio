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

import { folio } from '../..';
const { it, expect, xit, describe } = folio;

it('included test', () => {
  expect(1 + 1).toBe(2);
});

xit('excluded test', () => {
  expect(1 + 1).toBe(3);
});

it.skip('excluded test', () => {
  expect(1 + 1).toBe(3);
});

describe('included describe', () => {
  it('included describe test', () => {
    expect(1 + 1).toBe(2);
  });
});

describe.skip('excluded describe', () => {
  it('excluded describe test', () => {
    expect(1 + 1).toBe(3);
  });
});
