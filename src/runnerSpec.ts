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

import { installTransform } from './transform';
import { RunnerSuite, RunnerSpec } from './runnerTest';
import { extractLocation } from './util';
import { FixturesImpl, setImplementation } from './spec';
import { TestModifier } from './testModifier';

export function runnerSpec(suite: RunnerSuite, timeout: number): () => void {
  const suites = [suite];

  const it = (spec: 'default' | 'skip' | 'only', fixtures: FixturesImpl, title: string, modifierFn: (modifier: TestModifier, parameters: any) => void | Function, fn?: Function) => {
    const suite = suites[0];
    if (typeof fn !== 'function') {
      fn = modifierFn;
      modifierFn = null;
    }
    const test = new RunnerSpec(fixtures, title, fn, suite);
    test._usedParameters = fixtures._pool.parametersForFunction(fn, `Test`, true);
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

  const describe = (spec: 'default' | 'skip' | 'only', fixtures: FixturesImpl, title: string, modifierFn: (suite: TestModifier, parameters: any) => void | Function, fn?: Function) => {
    if (typeof fn !== 'function') {
      fn = modifierFn;
      modifierFn = null;
    }
    const child = new RunnerSuite(fixtures, title, suites[0]);
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

  const hook = (hookName: string, fixtures: FixturesImpl, fn: Function) => {
    const suite = suites[0];
    if (!suite.parent)
      throw new Error(`${hookName} hook should be called inside a describe block. Consider using an auto fixture.`);
    if (suite._fixtures !== fixtures)
      throw new Error(`Using ${hookName} hook from a different fixture set.\nAre you using describe and ${hookName} from different fixture files?`);
    fixtures._pool.parametersForFunction(fn, `${hookName} hook`, hookName === 'beforeEach' || hookName === 'afterEach');
  };

  setImplementation({
    it,
    describe,
    beforeEach: (fixtures, fn) => hook('beforeEach', fixtures, fn),
    afterEach: (fixtures, fn) => hook('afterEach', fixtures, fn),
    beforeAll: (fixtures, fn) => hook('beforeAll', fixtures, fn),
    afterAll: (fixtures, fn) => hook('afterAll', fixtures, fn),
  });

  return installTransform();
}
