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
import { currentTestInfo, FixturePool } from './fixtures';
import { Spec, Suite } from './test';
import { callLocation, errorWithCallLocation, interpretCondition } from './util';

Error.stackTraceLimit = 15;

export type SuitesWithOptions = { suite: Suite, fixtureOptions: folio.FixtureOptions }[];
let currentFile: { file: string, suitesWithOptions: SuitesWithOptions, fixturePool: FixturePool, ordinal: number } | undefined;

export function setCurrentFile(file: string, suitesWithOptions: SuitesWithOptions, fixturePool: FixturePool) {
  currentFile = { file, suitesWithOptions, ordinal: 0, fixturePool };
}
export function clearCurrentFile() {
  currentFile = undefined;
}

export function createTestImpl(fixtureOptions: folio.FixtureOptions) {
  if (!currentFile)
    throw errorWithCallLocation(`Test cannot be defined in a fixture file.`);

  const rootSuite = new Suite('');
  rootSuite._ordinal = currentFile.ordinal++;
  currentFile.suitesWithOptions.push({ suite: rootSuite, fixtureOptions });
  const location = callLocation(currentFile.file);
  rootSuite.file = location.file;
  rootSuite.line = location.line;
  rootSuite.column = location.column;

  const suites: Suite[] = [rootSuite];

  function spec(type: 'default' | 'only', title: string, fn: Function) {
    if (!currentFile)
      throw errorWithCallLocation(`Test cannot be defined in a fixture file.`);

    const spec = new Spec(title, fn, suites[0]);
    const location = callLocation(currentFile.file);
    spec.file = location.file;
    spec.line = location.line;
    spec.column = location.column;
    currentFile.fixturePool.validateFunction(fn, `Test`, true);

    if (type === 'only')
      spec._only = true;
  }

  function describe(type: 'default' | 'only', title: string, fn: Function) {
    if (!currentFile)
      throw errorWithCallLocation(`Suite cannot be defined in a fixture file.`);

    const child = new Suite(title, suites[0]);
    const location = callLocation(currentFile.file);
    child.file = location.file;
    child.line = location.line;
    child.column = location.column;

    if (type === 'only')
      child._only = true;

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

  const modifier = (type: 'skip' | 'fail' | 'fixme', arg?: boolean | string, description?: string) => {
    const processed = interpretCondition(arg, description);
    if (!processed.condition)
      return;

    if (currentFile) {
      suites[0]._annotations.push({ type, description: processed.description });
      return;
    }

    const testInfo = currentTestInfo();
    if (!testInfo)
      throw new Error(`test.${type} can only be called inside the test`);

    testInfo.annotations.push({ type, description: processed.description });
    if (type === 'skip' || type === 'fixme') {
      testInfo.expectedStatus = 'skipped';
      throw new SkipError(processed.description);
    } else if (type === 'fail') {
      if (testInfo.expectedStatus !== 'skipped')
        testInfo.expectedStatus = 'failed';
    }
  };

  const test: any = spec.bind(null, 'default');
  test.expect = expect;
  test.only = spec.bind(null, 'only');
  test.describe = describe.bind(null, 'default');
  test.describe.only = describe.bind(null, 'only');
  test.beforeEach = hook.bind(null, 'beforeEach');
  test.afterEach = hook.bind(null, 'afterEach');
  test.beforeAll = hook.bind(null, 'beforeAll');
  test.afterAll = hook.bind(null, 'afterAll');
  test.skip = modifier.bind(null, 'skip');
  test.fixme = modifier.bind(null, 'fixme');
  test.fail = modifier.bind(null, 'fail');
  return test;
}

export class SkipError extends Error {
}
