/**
 * Copyright Microsoft Corporation. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { installTransform } from './transform';
import { Config, DefinedEnv, Env, FullConfig } from './types';
import { errorWithCallLocation, mergeObjects, prependErrorMessage } from './util';
import { ConfigFileAPI, setCurrentlyLoadingConfigFile, setCurrentlyLoadingFileSuite } from './globals';
import { Suite } from './test';
import { DeclaredEnv, DefinedEnvImpl, rootTestType, TestTypeImpl } from './testType';

type SerializedLoaderData = {
  configs: (string | Config)[];
  overrides: Config[];
};

export class Loader implements ConfigFileAPI {
  private _mergedConfig: FullConfig;
  private _layeredConfigs: (string | Config)[] = [];
  private _configOverrides: Config[] = [];
  private _mergedOverrides: Config;
  private _runLists: RunList[] = [];
  private _fileSuites = new Map<string, Suite>();
  private _finished = false;

  constructor() {
    this._mergedConfig = {} as any;
    this._mergedOverrides = {};
  }

  deserialize(data: SerializedLoaderData) {
    for (const config of data.overrides)
      this.addConfigOverride(config);
    for (const config of data.configs) {
      if (typeof config === 'string')
        this.loadConfigFile(config);
      else
        this.addConfig(config);
    }
  }

  loadConfigFile(file: string) {
    const revertBabelRequire = installTransform();
    try {
      setCurrentlyLoadingConfigFile(this);
      require(file);
      this._layeredConfigs.push(file);
    } finally {
      revertBabelRequire();
      setCurrentlyLoadingConfigFile(undefined);
      this._finished = true;
    }
  }

  addConfig(config: Config) {
    if (this._finished)
      throw new Error('Cannot add config after loadConfigFile()');
    this._layeredConfigs.push(config);
    this._mergedConfig = mergeObjects(this._mergedConfig, config);
  }

  addConfigOverride(config: Config) {
    if (this._finished)
      throw new Error('Cannot add config after loadConfigFile()');
    this._configOverrides.push(config);
    this._mergedOverrides = mergeObjects(this._mergedOverrides, config);
  }

  loadTestFile(file: string) {
    if (this._fileSuites.has(file))
      return this._fileSuites.get(file)!;
    const revertBabelRequire = installTransform();
    try {
      const suite = new Suite('');
      suite.file = file;
      setCurrentlyLoadingFileSuite(suite);
      require(file);
      this._fileSuites.set(file, suite);
      return suite;
    } catch (e) {
      prependErrorMessage(e, `Error while reading ${file}:\n`);
      throw e;
    } finally {
      revertBabelRequire();
      setCurrentlyLoadingFileSuite(undefined);
    }
  }

  loadGlobalHook(file: string): () => any {
    const revertBabelRequire = installTransform();
    try {
      const hook = require(file);
      if (typeof hook !== 'function')
        throw errorWithCallLocation(`globalSetup and globalTeardown files must export a single function.`);
      return hook;
    } catch (e) {
      prependErrorMessage(e, `Error while reading ${file}:\n`);
      throw e;
    } finally {
      revertBabelRequire();
    }
  }

  runLists() {
    return this._runLists;
  }

  fileSuites() {
    return this._fileSuites;
  }

  serialize(): SerializedLoaderData {
    return {
      configs: this._layeredConfigs,
      overrides: this._configOverrides,
    };
  }

  // --------- ConfigFileAPI ---------

  addRunList(config: RunListConfig) {
    const configCopy = { ...config };
    delete configCopy.tag;
    delete configCopy.options;
    delete configCopy.defines;
    const fullConfig = mergeObjects(mergeObjects(this._mergedConfig, configCopy), this._mergedOverrides);

    const tag = 'tag' in config ? config.tag : [];
    const tags = Array.isArray(tag) ? tag : [tag];

    const defines = new Map<DeclaredEnv, Env>();
    for (const define of config.defines || []) {
      const impl = define as DefinedEnvImpl;
      defines.set(impl.declared, impl.env);
    }

    this._runLists.push(new RunList(fullConfig, this._runLists.length, config.options, tags, defines));
  }
}

export type RunListConfig<WorkerOptions = {}> = Config & {
  options?: WorkerOptions;
  tag?: string | string[];
  defines?: DefinedEnv[];
};

export class RunList {
  index: number;
  tags: string[];
  options: any;
  config: FullConfig;
  defines: Map<DeclaredEnv, Env>;

  constructor(config: FullConfig, index: number, options: any, tags: string[], defines: Map<DeclaredEnv, Env>) {
    this.config = config;
    this.index = index;
    this.options = options;
    this.tags = tags;
    this.defines = defines;
  }

  hashTestTypes() {
    const result = new Map<TestTypeImpl, string>();
    const visit = (t: TestTypeImpl, lastWithForkingEnv: TestTypeImpl) => {
      const envs = this.resolveEnvs(t);
      if (envs.length) {
        const env = envs[envs.length - 1];
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
    visit(rootTestType, rootTestType);
    return result;
  }

  resolveEnvs(testType: TestTypeImpl): Env[] {
    return testType.envs.map(e => e instanceof DeclaredEnv ? this.defines.get(e) || {} : e);
  }
}
