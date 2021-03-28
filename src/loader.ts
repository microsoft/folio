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
import { Config, FullConfig } from './types';
import { prependErrorMessage } from './util';
import { clearCurrentFile, isSuiteDescription, setCurrentFile, SuiteDescription } from './spec';

type SerializedLoaderData = {
  configs: (string | Config)[];
};

export class Loader {
  suites = new Map<string, SuiteDescription>();

  private _mergedConfig: FullConfig;
  private _layeredConfigs: { config: Config, source?: string }[] = [];

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
      const fileExports = require(file);
      if (!fileExports || typeof fileExports !== 'object')
        throw new Error(`Configuration file must export an object`);

      if ('config' in fileExports) {
        if (!fileExports.config || typeof fileExports.config !== 'object')
          throw new Error(`"config" must be an object`);
        // TODO: add config validation.
        this.addConfig(fileExports.config);
      } else {
        this.addConfig({});
      }
      this._layeredConfigs[this._layeredConfigs.length - 1].source = file;

      for (const [name, value] of Object.entries(fileExports)) {
        if (isSuiteDescription(value))
          this.suites.set(name, value as SuiteDescription);
      }
    } catch (e) {
      // Drop the stack.
      throw new Error(e.message);
    } finally {
      revertBabelRequire();
    }
  }

  addConfig(config: Config) {
    this._layeredConfigs.push({ config });
    this._mergedConfig = { ...this._mergedConfig, ...config };
  }

  loadTestFile(file: string) {
    const revertBabelRequire = installTransform();
    setCurrentFile(file);
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

  config(): FullConfig {
    return this._mergedConfig;
  }

  serialize(): SerializedLoaderData {
    return {
      configs: this._layeredConfigs.map(c => c.source || c.config),
    };
  }
}
