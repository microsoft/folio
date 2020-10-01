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

import * as fs from 'fs';
import { installTransform } from './transform';
import { RunnerSuite, RunnerSpec } from './runnerTest';
import { callerFile, extractLocation } from './util';
import { setImplementation } from './spec';
import { TestModifier } from './testModifier';

export function runnerSpec(suite: RunnerSuite, timeout: number, file: string): () => void {
  const resolvedFile = fs.realpathSync(file);
  const suites = [suite];

  const it = (spec: 'default' | 'skip' | 'only', title: string, modifierFn: (modifier: TestModifier, parameters: any) => void | Function, fn?: Function) => {
    const suite = suites[0];
    if (typeof fn !== 'function') {
      fn = modifierFn;
      modifierFn = null;
    }
    const test = new RunnerSpec(title, fn, suite);
    test.file = suite.file;
    test.location = extractLocation(new Error());
    if (spec === 'only')
      test._only = true;

    test._modifierFn = (modifier: TestModifier, parameters: any) => {
      if (spec === 'skip')
        modifier.skip();
      if (!modifier._timeout)
        modifier.setTimeout(timeout);
      if (modifierFn)
        modifierFn(modifier, parameters);
    };
    return test;
  };

  const describe = (spec: 'describe' | 'skip' | 'only', title: string, modifierFn: (suite: TestModifier, parameters: any) => void | Function, fn?: Function) => {
    if (typeof fn !== 'function') {
      fn = modifierFn;
      modifierFn = null;
    }
    const child = new RunnerSuite(title, suites[0]);
    child.file = suite.file;
    child.location = extractLocation(new Error());
    if (spec === 'only')
      child._only = true;

    child._modifierFn = (modifier: TestModifier, parameters: any) => {
      if (spec === 'skip')
        modifier.skip();
      if (!modifier._timeout)
        modifier.setTimeout(timeout);
      if (modifierFn)
        modifierFn(modifier, parameters);
    };

    suites.unshift(child);
    fn();
    suites.shift();
  };

  const hook = (hookName: string, fn: Function) => {
    const hookFile = callerFile(hook, 3);
    if (hookFile !== resolvedFile) {
      throw new Error(`${hookName} hook should be called from the test file.\n` +
          `Do you need a shared hook for multiple test files?\n` +
          `  - Use {auto: true} option in defineWorkerFixture instead of beforeAll/afterAll.\n` +
          `  - Use {auto: true} option in defineTestFixture instead of beforeEach/afterEach.`);
    }
    const obj = { stack: '' };
    Error.captureStackTrace(obj);
    const stack = obj.stack.substring('Error:\n'.length);
    suites[0]._addHook(hookName, fn, stack);
  };

  setImplementation({
    it,
    describe,
    beforeEach: fn => hook('beforeEach', fn),
    afterEach: fn => hook('afterEach', fn),
    beforeAll: fn => hook('beforeAll', fn),
    afterAll: fn => hook('afterAll', fn),
  });

  return installTransform();
}
