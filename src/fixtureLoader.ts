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

import { FixturePool } from './fixtures';
import { installTransform } from './transform';
import { builtinFixtures } from './builtinFixtures';
import { RootSuite } from './test';

const kExportsName = 'toBeRenamed';

export class FixtureLoader {
  readonly fixtureFiles: string[] = [];
  readonly fixturePool: FixturePool = new FixturePool(undefined);
  readonly configureFunctions: ((suite: RootSuite) => void)[] = [];

  constructor() {
    this._loadFolioObject(builtinFixtures);
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
    if ('configureSuite' in folioObject) {
      if (typeof folioObject.configureSuite !== 'function')
        throw new Error(`"${kExportsName}.configureSuite" must be a function`);
      this.configureFunctions.push(folioObject.configureSuite);
    }
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
      throw new Error(e.message);
    } finally {
      revertBabelRequire();
    }
  }

  finish() {
    this.fixturePool.validate();
  }
}
