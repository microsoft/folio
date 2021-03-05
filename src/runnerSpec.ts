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
import { callLocation } from './util';
import { setImplementation, SpecType } from './spec';
import { TestModifier } from './testModifier';
import { Config } from './config';
import { FixturePool } from './fixtures';

export function runnerSpec(suite: RunnerSuite, fixturePool: FixturePool, config: Config): () => void {
  const suites = [suite];

  const it = (spec: SpecType, title: string, modifierFn: (modifier: TestModifier, parameters: any) => void | Function, fn?: Function) => {
    const suite = suites[0];
    if (typeof fn !== 'function') {
      fn = modifierFn;
      modifierFn = null;
    }
    const test = new RunnerSpec(title, fn, suite);
    test._usedParameters = fixturePool.parametersForFunction(fn, `Test`, true);
    const location = callLocation(suite.file);
    test.file = location.file;
    test.line = location.line;
    test.column = location.column;
    if (spec === 'only')
      test._only = true;

    test._modifierFn = (modifier: TestModifier, parameters: any) => {
      if (spec === 'skip')
        modifier.skip();
      if (!modifier._timeout)
        modifier.setTimeout(config.timeout);
      if (modifierFn)
        modifierFn(modifier, parameters);
    };
    return test;
  };

  const describe = (spec: SpecType, title: string, modifierFn: (suite: TestModifier, parameters: any) => void | Function, fn?: Function) => {
    if (typeof fn !== 'function') {
      fn = modifierFn;
      modifierFn = null;
    }
    const child = new RunnerSuite(title, suites[0]);
    const location = callLocation(suite.file);
    child.file = location.file;
    child.line = location.line;
    child.column = location.column;
    if (spec === 'only')
      child._only = true;

    child._modifierFn = (modifier: TestModifier, parameters: any) => {
      if (spec === 'skip')
        modifier.skip();
      if (!modifier._timeout)
        modifier.setTimeout(config.timeout);
      if (modifierFn)
        modifierFn(modifier, parameters);
    };

    suites.unshift(child);
    fn();
    suites.shift();
  };

  const hook = (hookName: string, fn: Function) => {
    const suite = suites[0];
    suite._usedParameters.push(...fixturePool.parametersForFunction(fn, `${hookName} hook`, hookName === 'beforeEach' || hookName === 'afterEach'));
  };

  setImplementation({
    it,
    describe,
    beforeEach: fn => hook('beforeEach', fn),
    afterEach: fn => hook('afterEach', fn),
    beforeAll: fn => hook('beforeAll', fn),
    afterAll: fn => hook('afterAll', fn),
  });

  const revert = installTransform();
  return () => {
    setImplementation(undefined);
    revert();
  };
}
