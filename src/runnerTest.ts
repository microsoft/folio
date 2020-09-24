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

import { Spec, Suite, Test } from './test';
import { TestModifier } from './testModifier';

export type ModifierFn = (modifier: TestModifier, parameters: any) => void;

export class RunnerSpec extends Spec {
  _modifierFn: ModifierFn | null;

  constructor(title: string, fn: Function, suite: RunnerSuite) {
    super(title, fn, suite);
  }
}

export class RunnerSuite extends Suite {
  _modifierFn: ModifierFn | null;

  constructor(title: string, parent?: RunnerSuite) {
    super(title, parent);
  }

  _assignIds() {
    this.findSpec((test: RunnerSpec) => {
      for (const run of test.tests as RunnerTest[])
        run._id = `${test._ordinal}@${run.spec.file}::[${run._parametersString}]`;
    });
  }
}

export class RunnerTest extends Test {
  _parametersString: string;
  _workerHash: string;
  _id: string;

  constructor(spec: RunnerSpec) {
    super(spec);
  }
}
