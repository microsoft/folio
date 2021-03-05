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

import { FixturePool, setParameterValues } from './fixtures';
import { installTransform } from './transform';
import { builtinFixtures } from './builtinFixtures';

const kExportsName = 'toBeRenamed';

const fixturePool = new FixturePool(undefined);
loadFixturesObject(builtinFixtures);

function loadFixturesObject(fixturesObject: any) {
  if ('workerFixtures' in fixturesObject)
    loadFixtureSet('workerFixtures', fixturesObject.workerFixtures, 'worker', false);
  if ('autoWorkerFixtures' in fixturesObject)
    loadFixtureSet('autoWorkerFixtures', fixturesObject.autoWorkerFixtures, 'worker', true);
  if ('testFixtures' in fixturesObject)
    loadFixtureSet('testFixtures', fixturesObject.testFixtures, 'test', false);
  if ('autoTestFixtures' in fixturesObject)
    loadFixtureSet('autoTestFixtures', fixturesObject.autoTestFixtures, 'test', true);
  if ('parameters' in fixturesObject) {
    if (!fixturesObject.parameters || typeof fixturesObject.parameters !== 'object')
      throw new Error(`"${kExportsName}.parameters" must be an object with parameters`);
    for (const [name, parameter] of Object.entries(fixturesObject.parameters)) {
      if (!parameter || typeof parameter !== 'object')
        throw new Error(`"${kExportsName}.parameters.${name}" must be an object with "description", "defaultValue" and "values"`);
      if (typeof (parameter as any).description !== 'string')
        throw new Error(`"${kExportsName}.parameters.${name}.description" must be a string`);
      const defaultValue = (parameter as any).defaultValue;
      fixturePool.registerWorkerParameter({
        name,
        description: (parameter as any).description,
        defaultValue,
      });
      fixturePool.registerFixture(name, 'worker', async ({}, runTest) => runTest(defaultValue), false);
      if (Array.isArray((parameter as any).values))
        setParameterValues(name, (parameter as any).values);
      else
        setParameterValues(name, [defaultValue]);
    }
  }
}

function loadFixtureSet(objectName: string, fixtureSet: any, scope: 'test' | 'worker', auto: boolean) {
  if (!fixtureSet || typeof fixtureSet !== 'object')
    throw new Error(`"${kExportsName}.${objectName}" must be an object with fixture functions`);
  for (const [name, fixture] of Object.entries(fixtureSet)) {
    if (typeof fixture !== 'function')
      throw new Error(`"${kExportsName}.${objectName}.${name}" must be a fixture function`);
    fixturePool.registerFixture(name, scope, fixture, auto);
  }
}

export function loadFixtureFile(file: string) {
  const revertBabelRequire = installTransform();
  try {
    const fileExports = require(file);
    if (!fileExports || typeof fileExports !== 'object' || !fileExports[kExportsName] || typeof fileExports[kExportsName] !== 'object')
      throw new Error(`Fixture file did not export "${kExportsName}" object`);
    loadFixturesObject(fileExports[kExportsName]);
  } catch (e) {
    // Drop the stack.
    throw new Error(e.message);
  } finally {
    revertBabelRequire();
  }
}

export function loadedFixturePool() {
  return fixturePool;
}
