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
import { currentTestInfo } from './globals';
import { Spec, Suite } from './test';
import { callLocation, errorWithCallLocation, interpretCondition } from './util';
import { Config, Env, Reporter, RunWithConfig, TestType } from './types';

Error.stackTraceLimit = 15;

let currentFile: string | undefined;
export function setCurrentFile(file?: string) {
  currentFile = file;
}

type AnyTestType = TestType<any, any, any, any>;
export type TestTypeDescription = {
  fileSuites: Map<string, Suite>;
  children: Set<AnyTestType>;
  envs: Env<any>[];
  newEnv: Env<any> | undefined;
};
export type RunListDescription = {
  index: number;
  tags: string[];
  env: Env<any>;
  testType: AnyTestType;
  options: any;
  config: {
    outputDir?: string;
    repeatEach?: number;
    retries?: number;
    timeout?: number;
  };
};

export const configFile: {
  config?: Config,
  globalSetups: (() => any)[],
  globalTeardowns: (() => any)[],
  testTypeDescriptions: Map<AnyTestType, TestTypeDescription>,
  runLists: RunListDescription[],
  reporters: Reporter[],
} = { globalSetups: [], globalTeardowns: [], testTypeDescriptions: new Map(), runLists: [], reporters: [] };

let loadingConfigFile = false;
export function setLoadingConfigFile(loading: boolean) {
  loadingConfigFile = loading;
}

const countByFile = new Map<string, number>();

export function newTestTypeImpl(envs: Env<any>[], newEnv: Env<any> | undefined): any {
  const fileSuites = new Map<string, Suite>();
  const description: TestTypeDescription = {
    fileSuites,
    children: new Set(),
    envs,
    newEnv,
  };
  let suites: Suite[] = [];

  function ensureSuiteForCurrentLocation() {
    const location = callLocation(currentFile);
    let fileSuite = fileSuites.get(location.file);
    if (!fileSuite) {
      fileSuite = new Suite('');
      fileSuite.file = location.file;
      fileSuites.set(location.file, fileSuite);
    }
    if (suites[suites.length - 1] !== fileSuite)
      suites = [fileSuite];
    return location;
  }

  function spec(type: 'default' | 'only', title: string, fn: Function) {
    if (!currentFile)
      throw errorWithCallLocation(`Test can only be defined in a test file.`);
    const location = ensureSuiteForCurrentLocation();

    const ordinalInFile = countByFile.get(location.file) || 0;
    countByFile.set(location.file, ordinalInFile + 1);

    const spec = new Spec(title, fn, suites[0], ordinalInFile);
    spec.file = location.file;
    spec.line = location.line;
    spec.column = location.column;

    if (type === 'only')
      spec._only = true;
  }

  function describe(type: 'default' | 'only', title: string, fn: Function) {
    if (!currentFile)
      throw errorWithCallLocation(`Suite can only be defined in a test file.`);
    const location = ensureSuiteForCurrentLocation();

    const child = new Suite(title, suites[0]);
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
      throw errorWithCallLocation(`Hook can only be defined in a test file.`);
    ensureSuiteForCurrentLocation();
    suites[0]._addHook(name, fn);
  }

  const modifier = (type: 'skip' | 'fail' | 'fixme', arg?: boolean | string, description?: string) => {
    if (currentFile) {
      const processed = interpretCondition(arg, description);
      if (processed.condition)
        suites[0]._annotations.push({ type, description: processed.description });
      return;
    }

    const testInfo = currentTestInfo();
    if (!testInfo)
      throw new Error(`test.${type} can only be called inside the test`);
    (testInfo[type] as any)(arg, description);
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
  test.slow = modifier.bind(null, 'slow');
  test.setTimeout = (timeout: number) => {
    const testInfo = currentTestInfo();
    if (!testInfo)
      throw new Error(`test.setTimeout() can only be called inside the test`);
    testInfo.setTimeout(timeout);
  };
  test.useOptions = (options: any) => {
    if (!currentFile)
      throw errorWithCallLocation(`useOptions() can only be called in a test file.`);
    ensureSuiteForCurrentLocation();
    suites[0]._testOptions = options;
  };
  test.extend = (env?: Env<any>) => {
    const newTestType = newTestTypeImpl(env ? [...envs, env] : envs, env);
    description.children.add(newTestType);
    return newTestType;
  };
  test.declare = () => {
    const newTestType = newTestTypeImpl(envs, undefined);
    description.children.add(newTestType);
    return newTestType;
  };
  test.runWith = (env?: Env<any> & RunWithConfig<any>, config?: RunWithConfig<any>) => {
    if (!loadingConfigFile)
      throw errorWithCallLocation(`runWith() can only be called in a configuration file.`);
    env = env || {};
    config = config || env;
    const tag = 'tag' in config ? config.tag : [];
    configFile.runLists.push({
      index: configFile.runLists.length,
      env,
      tags: Array.isArray(tag) ? tag : [tag],
      options: config.options,
      config: {
        timeout: config.timeout,
        repeatEach: config.repeatEach,
        retries: config.retries,
        outputDir: config.outputDir,
      },
      testType: test,
    });
  };
  configFile.testTypeDescriptions.set(test, description);
  return test;
}

export function setConfig(config: Config) {
  // TODO: add config validation.
  configFile.config = config;
}

export function globalSetup(globalSetupFunction: () => any) {
  if (typeof globalSetupFunction !== 'function')
    throw errorWithCallLocation(`globalSetup() takes a single function argument.`);
  if (!loadingConfigFile)
    throw errorWithCallLocation(`globalSetup() can only be called in a configuration file.`);
  configFile.globalSetups.push(globalSetupFunction);
}

export function globalTeardown(globalTeardownFunction: () => any) {
  if (typeof globalTeardownFunction !== 'function')
    throw errorWithCallLocation(`globalTeardown() takes a single function argument.`);
  if (!loadingConfigFile)
    throw errorWithCallLocation(`globalTeardown() can only be called in a configuration file.`);
  configFile.globalTeardowns.push(globalTeardownFunction);
}

export function setReporters(reporters: Reporter[]) {
  configFile.reporters = reporters;
}
