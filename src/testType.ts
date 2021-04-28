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
import { currentlyLoadingConfigFile, currentlyLoadingFileSuite, currentTestInfo, setCurrentlyLoadingFileSuite } from './globals';
import { Spec, Suite } from './test';
import { callLocation, errorWithCallLocation, interpretCondition } from './util';
import { Env, RunWithConfig, TestType } from './types';

Error.stackTraceLimit = 15;

const countByFile = new Map<string, number>();

export class TestTypeImpl {
  readonly children = new Set<TestTypeImpl>();
  readonly envs: (Env | undefined)[];
  readonly test: TestType<any, any, any, any>;

  constructor(envs: (Env | undefined)[]) {
    this.envs = envs;

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

  private _spec(type: 'default' | 'only', title: string, fn: Function) {
    const suite = currentlyLoadingFileSuite();
    if (!suite)
      throw errorWithCallLocation(`Test can only be defined in a test file.`);
    const location = callLocation(suite.file);

    const ordinalInFile = countByFile.get(suite.file) || 0;
    countByFile.set(location.file, ordinalInFile + 1);

    const spec = new Spec(title, fn, suite, ordinalInFile, this);
    spec.file = location.file;
    spec.line = location.line;
    spec.column = location.column;

    if (type === 'only')
      spec._only = true;
  }

  private _describe(type: 'default' | 'only', title: string, fn: Function) {
    const suite = currentlyLoadingFileSuite();
    if (!suite)
      throw errorWithCallLocation(`Suite can only be defined in a test file.`);
    const location = callLocation(suite.file);

    const child = new Suite(title, suite);
    child.file = suite.file;
    child.line = location.line;
    child.column = location.column;

    if (type === 'only')
      child._only = true;

    setCurrentlyLoadingFileSuite(child);
    fn();
    setCurrentlyLoadingFileSuite(suite);
  }

  private _hook(name: string, fn: Function) {
    const suite = currentlyLoadingFileSuite();
    if (!suite)
      throw errorWithCallLocation(`Hook can only be defined in a test file.`);
    suite._addHook(name, fn);
  }

  private _modifier(type: 'skip' | 'fail' | 'fixme', arg?: boolean | string, description?: string) {
    const suite = currentlyLoadingFileSuite();
    if (suite) {
      const processed = interpretCondition(arg, description);
      if (processed.condition)
        suite._annotations.push({ type, description: processed.description });
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
    const suite = currentlyLoadingFileSuite();
    if (!suite)
      throw errorWithCallLocation(`useOptions() can only be called in a test file.`);
    suite._testOptions = options;
  }

  private _extend(env?: Env) {
    const child = new TestTypeImpl([...this.envs, env]);
    this.children.add(child);
    return child.test;
  }

  private _declare() {
    if (this.envs.some(env => env === undefined))
      throw errorWithCallLocation(`Cannot declare() twice.`);
    const child = new TestTypeImpl([...this.envs, undefined]);
    this.children.add(child);
    return child.test;
  }

  private _runWith(config?: RunWithConfig<any>, env?: Env) {
    const configFile = currentlyLoadingConfigFile();
    if (!configFile)
      throw errorWithCallLocation(`runWith() can only be called in a configuration file.`);
    configFile.addRunList(new RunList(this, env || {}, config || {} as any));
  }
}

export class RunList {
  index = 0;
  tags: string[];
  testType: TestTypeImpl;
  workerOptions: any;
  config: {
    outputDir?: string;
    repeatEach?: number;
    retries?: number;
    timeout?: number;
  };
  private _definedEnv: Env;

  constructor(testType: TestTypeImpl, definedEnv: Env, config: RunWithConfig<any>) {
    const tag = 'tag' in config ? config.tag : [];
    this.tags = Array.isArray(tag) ? tag : [tag];
    this._definedEnv = definedEnv;
    this.workerOptions = config.options;
    this.config = {
      timeout: config.timeout,
      repeatEach: config.repeatEach,
      retries: config.retries,
      outputDir: config.outputDir,
    };
    this.testType = testType;
  }

  hashTestTypes() {
    const result = new Map<TestTypeImpl, string>();
    const visit = (t: TestTypeImpl, lastWithForkingEnv: TestTypeImpl) => {
      if (t.envs.length) {
        const env = t.envs[t.envs.length - 1];
        // Fork if we get an environment with worker-level hooks,
        // or if we have a spot for declared environment to be filled during runWith.
        if (!env || env.beforeAll || env.afterAll)
          lastWithForkingEnv = t;
      }
      let envHash = result.get(lastWithForkingEnv);
      if (!envHash) {
        envHash = String(result.size);
        result.set(lastWithForkingEnv, envHash);
      }
      result.set(t, envHash);
      for (const child of t.children)
        visit(child, lastWithForkingEnv);
    };
    visit(this.testType, this.testType);
    return result;
  }

  defineEnv(envs: (Env | undefined)[]): Env[] {
    // Replace the undefined spot with our defined env.
    return envs.map(env => env || this._definedEnv);
  }
}
