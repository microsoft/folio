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

import { assignConfig, FixturePool } from './fixtures';
import { installTransform } from './transform';
import { builtinFixtures } from './builtinFixtures';
import { Config, PartialConfig } from './types';
import { mergeFixtureOptions, prependErrorMessage } from './util';
import { clearCurrentFile, setCurrentFile, SuitesWithOptions } from './spec';

const kExportsName = 'toBeRenamed';

type SerializedLoaderData = {
  configs: (string | PartialConfig)[];
  fixtureFiles: string[];
  testPathSegment: string;
};

export class Loader {
  readonly fixtureFiles: string[] = [];
  readonly fixturePool: FixturePool = new FixturePool(undefined);
  readonly suitesWithOptions: SuitesWithOptions = [];
  testPathSegment: string = '';

  private _mergedConfig: Config;
  private _layeredConfigs: { config: PartialConfig, source?: string }[] = [];

  constructor(defaultConfig: Config) {
    this._layeredConfigs = [{ config: defaultConfig }];
    this._loadFolioObject(builtinFixtures);
    this._mergedConfig = { ...defaultConfig };
  }

  deserialize(data: SerializedLoaderData) {
    this.testPathSegment = data.testPathSegment;
    for (const config of data.configs) {
      if (typeof config === 'string')
        this.loadConfigFile(config);
      else
        this.addConfig(config);
    }
    this.assignConfig();
    for (const fixtureFile of data.fixtureFiles)
      this.loadFixtureFile(fixtureFile);
    this.validateFixtures();
  }

  private _loadFolioObject(folioObject: any) {
    if ('workerFixtures' in folioObject)
      this._loadFixtureSet('workerFixtures', folioObject.workerFixtures, 'worker', false);
    if ('autoWorkerFixtures' in folioObject)
      this._loadFixtureSet('autoWorkerFixtures', folioObject.autoWorkerFixtures, 'worker', true);
    if ('testFixtures' in folioObject)
      this._loadFixtureSet('testFixtures', folioObject.testFixtures, 'test', false);
    if ('autoTestFixtures' in folioObject)
      this._loadFixtureSet('autoTestFixtures', folioObject.autoTestFixtures, 'test', true);
  }

  private _loadFixtureSet(objectName: string, fixtureSet: any, scope: 'test' | 'worker', auto: boolean) {
    if (!fixtureSet || typeof fixtureSet !== 'object')
      throw new Error(`"${kExportsName}.${objectName}" must be an object with fixture functions`);
    for (const [name, fixture] of Object.entries(fixtureSet)) {
      if (typeof fixture !== 'function')
        throw new Error(`"${kExportsName}.${objectName}.${name}" must be a fixture function`);
      this.fixturePool.registerFixture(name, scope, fixture, auto);
    }
  }

  loadFixtureFile(file: string) {
    this.fixtureFiles.push(file);
    const revertBabelRequire = installTransform();
    try {
      const fileExports = require(file);
      if (!fileExports || typeof fileExports !== 'object' || !fileExports[kExportsName] || typeof fileExports[kExportsName] !== 'object')
        throw new Error(`Fixture file did not export "${kExportsName}" object`);
      this._loadFolioObject(fileExports[kExportsName]);
    } catch (e) {
      // Drop the stack.
      const error = new Error(e.message);
      prependErrorMessage(error, `Error while reading ${file}:\n`);
      throw error;
    } finally {
      revertBabelRequire();
    }
  }

  loadConfigFile(file: string) {
    const revertBabelRequire = installTransform();
    try {
      const fileExports = require(file);
      if (!fileExports || typeof fileExports !== 'object' || !fileExports.config || typeof fileExports.config !== 'object')
        throw new Error(`Folio config file did not export "config" object`);
      // TODO: add config validation.
      this.addConfig(fileExports.config);
      this._layeredConfigs[this._layeredConfigs.length - 1].source = file;
    } catch (e) {
      // Drop the stack.
      throw new Error(e.message);
    } finally {
      revertBabelRequire();
    }
  }

  addConfig(config: PartialConfig) {
    this._layeredConfigs.push({ config });
    const mergedFixtureOptions = mergeFixtureOptions(this._mergedConfig.fixtureOptions, config.fixtureOptions || {});
    this._mergedConfig = { ...this._mergedConfig, ...config, fixtureOptions: mergedFixtureOptions };
  }

  assignConfig() {
    assignConfig(this.config());
  }

  loadTestFile(file: string) {
    const revertBabelRequire = installTransform();
    setCurrentFile(file, this.suitesWithOptions, this.fixturePool);
    try {
      require(file);
    } catch (e) {
      prependErrorMessage(e, `Error while reading ${file}:\n`);
      throw e;
    } finally {
      clearCurrentFile();
      revertBabelRequire();
    }
  }

  validateFixtures() {
    this.fixturePool.validate();
  }

  config() {
    return this._mergedConfig;
  }

  serialize(): SerializedLoaderData {
    return {
      configs: this._layeredConfigs.map(c => c.source || c.config),
      fixtureFiles: this.fixtureFiles,
      testPathSegment: this.testPathSegment,
    };
  }
}
