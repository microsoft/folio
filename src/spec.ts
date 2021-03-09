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

import { expect } from './expect';
import { config, FixturePool } from './fixtures';
import { RootSuite, Spec, Suite } from './test';
import { TestModifier } from './testModifier';
import { callLocation, errorWithCallLocation } from './util';

Error.stackTraceLimit = 15;

let currentFile: { file: string, rootSuites: RootSuite[], fixturePool: FixturePool, ordinal: number } | undefined;

export function setCurrentFile(file: string, rootSuites: RootSuite[], fixturePool: FixturePool) {
  currentFile = { file, rootSuites, ordinal: 0, fixturePool };
}
export function clearCurrentFile() {
  currentFile = undefined;
}

export function createTestImpl(options: folio.SuiteOptions) {
  if (!currentFile)
    throw errorWithCallLocation(`Test cannot be defined in a fixture file.`);

  const rootSuite = new RootSuite('');
  rootSuite.options = options;
  rootSuite._ordinal = currentFile.ordinal++;
  currentFile.rootSuites.push(rootSuite);
  const location = callLocation(currentFile.file);
  rootSuite.file = location.file;
  rootSuite.line = location.line;
  rootSuite.column = location.column;

  const suites: Suite[] = [rootSuite];

  function spec(type: 'default' | 'skip' | 'only', title: string, modifierFn: (modifier: TestModifier, variation: folio.SuiteVariation) => void | Function, fn?: Function) {
    if (!currentFile)
      throw errorWithCallLocation(`Test cannot be defined in a fixture file.`);

    if (typeof fn !== 'function') {
      fn = modifierFn;
      modifierFn = null;
    }
    const spec = new Spec(title, fn, suites[0]);
    const location = callLocation(currentFile.file);
    spec.file = location.file;
    spec.line = location.line;
    spec.column = location.column;
    currentFile.fixturePool.validateFunction(fn, `Test`, true);

    if (type === 'only')
      spec._only = true;
    spec._modifierFn = (modifier: TestModifier, variation: folio.SuiteVariation) => {
      if (type === 'skip')
        modifier.skip();
      if (!modifier._timeout)
        modifier.setTimeout(config.timeout);
      if (modifierFn)
        modifierFn(modifier, variation);
    };
  }

  function describe(type: 'default' | 'skip' | 'only', title: string, modifierFn: (modifier: TestModifier, parameters: any) => void | Function, fn?: Function) {
    if (!currentFile)
      throw errorWithCallLocation(`Suite cannot be defined in a fixture file.`);

    if (typeof fn !== 'function') {
      fn = modifierFn;
      modifierFn = null;
    }
    const child = new Suite(title, suites[0]);
    const location = callLocation(currentFile.file);
    child.file = location.file;
    child.line = location.line;
    child.column = location.column;

    if (type === 'only')
      child._only = true;
    child._modifierFn = (modifier: TestModifier, variation: folio.SuiteVariation) => {
      if (type === 'skip')
        modifier.skip();
      if (!modifier._timeout)
        modifier.setTimeout(config.timeout);
      if (modifierFn)
        modifierFn(modifier, variation);
    };

    suites.unshift(child);
    fn();
    suites.shift();
  }

  function hook(name: string, fn: Function) {
    if (!currentFile)
      throw errorWithCallLocation(`Hook cannot be defined in a fixture file.`);

    currentFile.fixturePool.validateFunction(fn, `${name} hook`, name === 'beforeEach' || name === 'afterEach');
    suites[0]._addHook(name, fn);
  }

  const test: any = spec.bind(null, 'default');
  test.expect = expect;
  test.skip = spec.bind(null, 'skip');
  test.only = spec.bind(null, 'only');
  test.describe = describe.bind(null, 'default');
  test.describe.skip = describe.bind(null, 'skip');
  test.describe.only = describe.bind(null, 'only');
  test.beforeEach = hook.bind(null, 'beforeEach');
  test.afterEach = hook.bind(null, 'afterEach');
  test.beforeAll = hook.bind(null, 'beforeAll');
  test.afterAll = hook.bind(null, 'afterAll');
  return test;
}
