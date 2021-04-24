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
};

export class Loader implements ConfigFileAPI {
  private _mergedConfig: FullConfig;
  private _layeredConfigs: { config: Config, source?: string }[] = [];
  private _configFromConfigFile?: Config;
  private _globalSetups: (() => any)[] = [];
  private _globalTeardowns: (() => any)[] = [];
  private _runLists: RunList[] = [];
  private _reporters: Reporter[] = [];
  private _fileSuites = new Map<string, Suite>();

  constructor() {
    this._mergedConfig = {} as any;
  }

  deserialize(data: SerializedLoaderData) {
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
      this._configFromConfigFile = undefined;
      require(file);
      this.addConfig(this._configFromConfigFile || {});
      this._layeredConfigs[this._layeredConfigs.length - 1].source = file;
    } catch (e) {
      // Drop the stack.
      throw new Error(e.message);
    } finally {
      revertBabelRequire();
      setCurrentlyLoadingConfigFile(undefined);
    }
  }

  addConfig(config: Config) {
    this._layeredConfigs.push({ config });
    this._mergedConfig = mergeObjects(this._mergedConfig, config);
  }

  loadTestFile(file: string) {
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

  config(runList?: RunList): FullConfig {
    if (!runList)
      return this._mergedConfig;
    return mergeObjects(this._mergedConfig, runList.config);
  }

  runLists() {
    return this._runLists;
  }

  fileSuites() {
    return this._fileSuites;
  }

  reporters() {
    return this._reporters;
  }

  globalSetups() {
    return this._globalSetups;
  }

  globalTeardowns() {
    return this._globalTeardowns;
  }

  serialize(): SerializedLoaderData {
    return {
      configs: this._layeredConfigs.map(c => c.source || c.config),
    };
  }

  // --------- ConfigFileAPI ---------

  setConfig(config: Config) {
    // TODO: add config validation.
    this._configFromConfigFile = config;
  }

  globalSetup(globalSetupFunction: () => any) {
    if (typeof globalSetupFunction !== 'function')
      throw errorWithCallLocation(`globalSetup() takes a single function argument.`);
    this._globalSetups.push(globalSetupFunction);
  }

  globalTeardown(globalTeardownFunction: () => any) {
    if (typeof globalTeardownFunction !== 'function')
      throw errorWithCallLocation(`globalTeardown() takes a single function argument.`);
    this._globalTeardowns.push(globalTeardownFunction);
  }

  setReporters(reporters: Reporter[])  {
    this._reporters = reporters;
  }

  addRunList(runList: RunList) {
    runList.index = this._runLists.length;
    this._runLists.push(runList);
  }
}
