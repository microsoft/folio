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
import { ModifierFn, TestModifier } from './testModifier';
import { FixtureLoader } from './fixtureLoader';
import { RootSuite, Suite } from './test';

export function generateTests(suites: RootSuite[], config: Config, fixtureLoader: FixtureLoader): Suite {
  const rootSuite = new Suite('');
  let grep: RegExp = null;
  if (config.grep) {
    const match = config.grep.match(/^\/(.*)\/(g|i|)$|.*/);
    grep = new RegExp(match[1] || match[0], match[2]);
  }

  for (const suite of suites) {
    // Name each test.
    suite._renumber();

    const specs = suite._allSpecs().filter(spec => {
      if (grep && !grep.test(spec.fullTitle()))
        return false;
      return true;
    });
    if (!specs.length)
      continue;

    for (const fn of fixtureLoader.configureFunctions)
      fn(suite);

    for (const variation of suite.variations) {
      for (const spec of specs) {
        const modifierFns: ModifierFn[] = [];
        if (spec._modifierFn)
          modifierFns.push(spec._modifierFn);
        for (let parent = spec.parent; parent; parent = parent.parent) {
          if (parent._modifierFn)
            modifierFns.push(parent._modifierFn);
        }
        modifierFns.reverse();
        const modifier = new TestModifier();
        for (const modifierFn of modifierFns)
          modifierFn(modifier, variation);
        for (let i = 0; i < config.repeatEach; ++i) {
          const test = spec._appendTest(variation, i);
          test.skipped = modifier._skipped;
          test.slow = modifier._slow;
          test.expectedStatus = modifier._expectedStatus;
          test.timeout = modifier._timeout;
          test.annotations = modifier._annotations;
        }
      }
    }
    rootSuite._addSuite(suite);
  }
  filterOnly(rootSuite);
  rootSuite._countTotal();
  return rootSuite;
}

function filterOnly(suite: Suite) {
  const onlySuites = suite.suites.filter(child => filterOnly(child) || child._only);
  const onlyTests = suite.specs.filter(spec => spec._only);
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
