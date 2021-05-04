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
import { Config, FullConfig, Reporter } from './types';
import { errorWithCallLocation, mergeObjects, prependErrorMessage } from './util';
import { RunList } from './testType';
import { ConfigFileAPI, setCurrentlyLoadingConfigFile, setCurrentlyLoadingFileSuite } from './globals';
import { Suite } from './test';

type SerializedLoaderData = {
  configs: (string | Config)[];
  overrides: Config[];
};

export class Loader implements ConfigFileAPI {
  private _mergedConfig: FullConfig;
  private _layeredConfigs: { config: Config, source?: string }[] = [];
  private _configFromConfigFile?: Config;
  private _configOverrides: { config: Config, }[] = [];
  private _mergedOverrides: Config;
  private _runLists: RunList[] = [];
  private _fileSuites = new Map<string, Suite>();

  constructor() {
    this._mergedConfig = {} as any;
    this._mergedOverrides = {};
  }

  deserialize(data: SerializedLoaderData) {
    for (const config of data.configs) {
      if (typeof config === 'string')
        this.loadConfigFile(config);
      else
        this.addConfig(config);
    }
    for (const config of data.overrides)
      this.addConfigOverride(config);
  }

  loadConfigFile(file: string) {
    const revertBabelRequire = installTransform();
    try {
      setCurrentlyLoadingConfigFile(this);
      this._configFromConfigFile = undefined;
      require(file);
      this.addConfig(this._configFromConfigFile || {});
      this._layeredConfigs[this._layeredConfigs.length - 1].source = file;
    } finally {
      revertBabelRequire();
      setCurrentlyLoadingConfigFile(undefined);
    }
  }

  addConfig(config: Config) {
    this._layeredConfigs.push({ config });
    this._mergedConfig = mergeObjects(this._mergedConfig, config);
  }

  addConfigOverride(config: Config) {
    this._configOverrides.push({ config });
    this._mergedOverrides = mergeObjects(this._mergedOverrides, config);
  }

  loadTestFile(file: string) {
    if (this._fileSuites.has(file))
      return this._fileSuites.get(file);
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

  config(runList?: RunList): FullConfig {
    if (!runList)
      return mergeObjects(this._mergedConfig, this._mergedOverrides);
    return mergeObjects(mergeObjects(this._mergedConfig, runList.config), this._mergedOverrides);
  }

  runLists() {
    return this._runLists;
  }

  fileSuites() {
    return this._fileSuites;
  }

  serialize(): SerializedLoaderData {
    return {
      configs: this._layeredConfigs.map(c => c.source || c.config),
      overrides: this._configOverrides.map(c => c.config),
    };
  }

  // --------- ConfigFileAPI ---------

  setConfig(config: Config) {
    // TODO: add config validation.
    this._configFromConfigFile = config;
  }

  addRunList(runList: RunList) {
    runList.index = this._runLists.length;
    this._runLists.push(runList);
  }
}
