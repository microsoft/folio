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

import { Config } from './config';
import { RunnerSuite, RunnerSpec, RunnerTest } from './runnerTest';
import { ModifierFn, TestModifier } from './testModifier';
import { FixtureLoader } from './fixtureLoader';
import { RootSuite } from './test';

export function generateTests(suites: RootSuite[], config: Config, fixtureLoader: FixtureLoader): RunnerSuite {
  const rootSuite = new RunnerSuite('');
  let grep: RegExp = null;
  if (config.grep) {
    const match = config.grep.match(/^\/(.*)\/(g|i|)$|.*/);
    grep = new RegExp(match[1] || match[0], match[2]);
  }

  for (const suite of suites) {
    // Name each test.
    suite._renumber();

    const specs = (suite._allSpecs() as RunnerSpec[]).filter(spec => {
      if (grep && !grep.test(spec.fullTitle()))
        return false;
      return true;
    });
    if (!specs.length)
      continue;

    for (const fn of fixtureLoader.configureFunctions)
      fn(suite);

    const variations = suite.variations;
    for (const variation of variations) {
      const variationStringPrefix = serializeVariation(variation);
      for (const spec of specs) {
        const modifierFns: ModifierFn[] = [];
        if (spec._modifierFn)
          modifierFns.push(spec._modifierFn);
        for (let parent = spec.parent as RunnerSuite; parent; parent = parent.parent as RunnerSuite) {
          if (parent._modifierFn)
            modifierFns.push(parent._modifierFn);
        }
        modifierFns.reverse();
        const modifier = new TestModifier();
        for (const modifierFn of modifierFns)
          modifierFn(modifier, variation);
        for (let i = 0; i < config.repeatEach; ++i) {
          const variationString = variationStringPrefix + `#repeat-${i}#`;
          const test = new RunnerTest(spec);
          test._workerHash = variationString;
          test._variationString = variationString;
          test._id = `${suite._ordinal}/${spec._ordinal}@${spec.file}::[${variationString}]`;
          test.variation = variation;
          test.skipped = modifier._skipped;
          test.slow = modifier._slow;
          test.expectedStatus = modifier._expectedStatus;
          test.timeout = modifier._timeout;
          test.annotations = modifier._annotations;
          test._repeatEachIndex = i;
          spec.tests.push(test);
        }
      }
    }
    rootSuite._addSuite(suite);
  }
  filterOnly(rootSuite);
  rootSuite._countTotal();
  return rootSuite;
}

function filterOnly(suite: RunnerSuite) {
  const onlySuites = suite.suites.filter((child: RunnerSuite) => filterOnly(child) || child._only);
  const onlyTests = suite.specs.filter((test: RunnerSpec) => test._only);
  if (onlySuites.length || onlyTests.length) {
    suite.suites = onlySuites;
    suite.specs = onlyTests;
    return true;
  }
  return false;
}

function serializeVariation(variation: folio.SuiteVariation): string {
  const tokens = [];
  for (const [name, value] of Object.entries(variation))
    tokens.push(`${name}=${value}`);
  return tokens.join(', ');
}
