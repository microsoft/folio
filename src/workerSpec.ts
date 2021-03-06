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

import { WorkerSpec, WorkerSuite } from './workerTest';
import { installTransform } from './transform';
import { callLocation } from './util';
import { setImplementation, SpecType } from './spec';
import { TestModifier } from './testModifier';

export function workerSpec(rootSuite: WorkerSuite): () => void {
  let suites = [rootSuite];

  const startSuite = (options: folio.SuiteOptions) => {
    const suite = new WorkerSuite('', rootSuite);
    suite._options = options;
    const location = callLocation(rootSuite.file);
    suite.file = location.file;
    suite.line = location.line;
    suite.column = location.column;
    suites = [suite, rootSuite];
  };

  const it = (spec: SpecType, title: string, modifierFn: (modifier: TestModifier, parameters: any) => void | Function, fn?: Function) => {
    fn = fn || modifierFn;
    const test = new WorkerSpec(title, fn, suites[0]);
    const location = callLocation(rootSuite.file);
    test.file = location.file;
    test.line = location.line;
    test.column = location.column;
    return test;
  };

  const describe = (spec: SpecType, title: string, modifierFn: (modifier: TestModifier, parameters: any) => void | Function, fn?: Function) => {
    fn = fn || modifierFn;
    const child = new WorkerSuite(title, suites[0]);
    const location = callLocation(rootSuite.file);
    child.file = location.file;
    child.line = location.line;
    child.column = location.column;
    suites.unshift(child);
    fn();
    suites.shift();
  };

  setImplementation({
    startSuite,
    it,
    describe,
    beforeEach: fn => suites[0]._addHook('beforeEach', fn),
    afterEach: fn => suites[0]._addHook('afterEach', fn),
    beforeAll: fn => suites[0]._addHook('beforeAll', fn),
    afterAll: fn => suites[0]._addHook('afterAll', fn),
  });

  const revert = installTransform();
  return () => {
    setImplementation(undefined);
    revert();
  };
}
