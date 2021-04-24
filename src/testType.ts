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
import { currentlyLoadingConfigFile, currentlyLoadingTestFile, currentTestInfo } from './globals';
import { Spec, Suite } from './test';
import { callLocation, errorWithCallLocation, interpretCondition } from './util';
import { Env, RunWithConfig, TestType } from './types';

Error.stackTraceLimit = 15;

const countByFile = new Map<string, number>();

export class TestTypeImpl {
  readonly fileSuites = new Map<string, Suite>();
  readonly children = new Set<TestTypeImpl>();
  readonly envs: Env<any>[];
  readonly newEnv: Env<any> | undefined;
  readonly test: TestType<any, any, any, any>;

  private _suites: Suite[] = [];

  constructor(envs: Env<any>[], newEnv: Env<any> | undefined) {
    this.envs = envs;
    this.newEnv = newEnv;

    const test: any = this._spec.bind(this, 'default');
    test.expect = expect;
    test.only = this._spec.bind(this, 'only');
    test.describe = this._describe.bind(this, 'default');
    test.describe.only = this._describe.bind(this, 'only');
    test.beforeEach = this._hook.bind(this, 'beforeEach');
    test.afterEach = this._hook.bind(this, 'afterEach');
    test.beforeAll = this._hook.bind(this, 'beforeAll');
    test.afterAll = this._hook.bind(this, 'afterAll');
    test.skip = this._modifier.bind(this, 'skip');
    test.fixme = this._modifier.bind(this, 'fixme');
    test.fail = this._modifier.bind(this, 'fail');
    test.slow = this._modifier.bind(this, 'slow');
    test.setTimeout = this._setTimeout.bind(this);
    test.useOptions = this._useOptions.bind(this);
    test.extend = this._extend.bind(this);
    test.declare = this._declare.bind(this);
    test.runWith = this._runWith.bind(this);
    this.test = test;
  }

  descriptionsToRun() {
    const result = new Set<{
      fileSuites: Map<string, Suite>;
      envs: Env<any>[];
      envHash: string;
    }>();
    const hashByTestType = new Map<TestTypeImpl, string>();

    const visit = (t: TestTypeImpl, lastWithForkingEnv: TestTypeImpl) => {
      // Fork if we get an environment with worker-level hooks.
      if (t.newEnv && (t.newEnv.beforeAll || t.newEnv.afterAll))
        lastWithForkingEnv = t;
      let envHash = hashByTestType.get(lastWithForkingEnv);
      if (!envHash) {
        envHash = String(hashByTestType.size);
        hashByTestType.set(lastWithForkingEnv, envHash);
      }

      result.add({
        fileSuites: t.fileSuites,
        envs: t.envs,
        envHash
      });
      for (const child of t.children)
        visit(child, lastWithForkingEnv);
    };
    visit(this, this);
    return result;
  }

  private _ensureSuiteForCurrentLocation() {
    const location = callLocation(currentlyLoadingTestFile());
    let fileSuite = this.fileSuites.get(location.file);
    if (!fileSuite) {
      fileSuite = new Suite('');
      fileSuite.file = location.file;
      this.fileSuites.set(location.file, fileSuite);
    }
    if (this._suites[this._suites.length - 1] !== fileSuite)
      this._suites = [fileSuite];
    return location;
  }

  private _spec(type: 'default' | 'only', title: string, fn: Function) {
    if (!currentlyLoadingTestFile())
      throw errorWithCallLocation(`Test can only be defined in a test file.`);
    const location = this._ensureSuiteForCurrentLocation();

    const ordinalInFile = countByFile.get(location.file) || 0;
    countByFile.set(location.file, ordinalInFile + 1);

    const spec = new Spec(title, fn, this._suites[0], ordinalInFile);
    spec.file = location.file;
    spec.line = location.line;
    spec.column = location.column;

    if (type === 'only')
      spec._only = true;
  }

  private _describe(type: 'default' | 'only', title: string, fn: Function) {
    if (!currentlyLoadingTestFile())
      throw errorWithCallLocation(`Suite can only be defined in a test file.`);
    const location = this._ensureSuiteForCurrentLocation();

    const child = new Suite(title, this._suites[0]);
    child.file = location.file;
    child.line = location.line;
    child.column = location.column;

    if (type === 'only')
      child._only = true;

    this._suites.unshift(child);
    fn();
    this._suites.shift();
  }

  private _hook(name: string, fn: Function) {
    if (!currentlyLoadingTestFile())
      throw errorWithCallLocation(`Hook can only be defined in a test file.`);
    this._ensureSuiteForCurrentLocation();
    this._suites[0]._addHook(name, fn);
  }

  private _modifier(type: 'skip' | 'fail' | 'fixme', arg?: boolean | string, description?: string) {
    if (currentlyLoadingTestFile()) {
      const processed = interpretCondition(arg, description);
      if (processed.condition)
        this._suites[0]._annotations.push({ type, description: processed.description });
      return;
    }

    const testInfo = currentTestInfo();
    if (!testInfo)
      throw new Error(`test.${type} can only be called inside the test`);
    (testInfo[type] as any)(arg, description);
  }

  private _setTimeout(timeout: number) {
    const testInfo = currentTestInfo();
    if (!testInfo)
      throw new Error(`test.setTimeout() can only be called inside the test`);
    testInfo.setTimeout(timeout);
  }

  private _useOptions(options: any) {
    if (!currentlyLoadingTestFile())
      throw errorWithCallLocation(`useOptions() can only be called in a test file.`);
    this._ensureSuiteForCurrentLocation();
    this._suites[0]._testOptions = options;
  }

  private _extend(env?: Env<any>) {
    const child = new TestTypeImpl(env ? [...this.envs, env] : this.envs, env);
    this.children.add(child);
    return child.test;
  }

  private _declare() {
    const child = new TestTypeImpl(this.envs, undefined);
    this.children.add(child);
    return child.test;
  }

  private _runWith(env?: Env<any> & RunWithConfig<any>, config?: RunWithConfig<any>) {
    const configFile = currentlyLoadingConfigFile();
    if (!configFile)
      throw errorWithCallLocation(`runWith() can only be called in a configuration file.`);
    env = env || {};
    config = config || env;
    configFile.runWith(this, env, config);
  }
}
