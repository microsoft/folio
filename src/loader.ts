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
import { Config, Env, FullConfig, Reporter, TestType } from './types';
import { mergeObjects, prependErrorMessage } from './util';
import { configFile, setCurrentFile, RunListDescription, setLoadingConfigFile } from './spec';
import { Suite } from './test';

type SerializedLoaderData = {
  configs: (string | Config)[];
};

export class Loader {
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
      setLoadingConfigFile(true);
      require(file);
      this.addConfig(configFile.config || {});
      this._layeredConfigs[this._layeredConfigs.length - 1].source = file;
    } catch (e) {
      // Drop the stack.
      throw new Error(e.message);
    } finally {
      revertBabelRequire();
      setLoadingConfigFile(false);
    }
  }

  addConfig(config: Config) {
    this._layeredConfigs.push({ config });
    this._mergedConfig = mergeObjects(this._mergedConfig, config);
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
      setCurrentFile();
      revertBabelRequire();
    }
  }

  config(runList?: RunListDescription): FullConfig {
    if (!runList)
      return this._mergedConfig;
    return mergeObjects(this._mergedConfig, runList.config);
  }

  runLists(): RunListDescription[] {
    return configFile.runLists;
  }

  descriptionsForRunList(runList: RunListDescription) {
    const result = new Set<{
      fileSuites: Map<string, Suite>;
      envs: Env<any>[];
      envHash: string;
    }>();
    type AnyTestType = TestType<any, any, any, any>;
    const hashByTestType = new Map<AnyTestType, string>();

    const visit = (t: AnyTestType, lastWithForkingEnv: AnyTestType) => {
      const description = configFile.testTypeDescriptions.get(t)!;

      // Fork if we get an environment with worker-level hooks.
      if (description.newEnv && (description.newEnv.beforeAll || description.newEnv.afterAll))
        lastWithForkingEnv = t;
      let envHash = hashByTestType.get(lastWithForkingEnv);
      if (!envHash) {
        envHash = String(hashByTestType.size);
        hashByTestType.set(lastWithForkingEnv, envHash);
      }

      result.add({
        fileSuites: description.fileSuites,
        envs: description.envs,
        envHash
      });
      for (const child of description.children)
        visit(child, lastWithForkingEnv);
    };
    visit(runList.testType, runList.testType);
    return result;
  }

  reporters(): Reporter[] {
    return configFile.reporters;
  }

  globalSetups(): (() => any)[] {
    return configFile.globalSetups;
  }

  globalTeardowns(): (() => any)[] {
    return configFile.globalTeardowns;
  }

  serialize(): SerializedLoaderData {
    return {
      configs: this._layeredConfigs.map(c => c.source || c.config),
    };
  }
}
