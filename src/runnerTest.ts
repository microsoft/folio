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

import { Spec, Suite, Test, TestResult } from './test';
import { TestModifier } from './testModifier';

export type ModifierFn = (modifier: TestModifier, parameters: any) => void;

export class RunnerSpec extends Spec {
  _modifierFn: ModifierFn | null;
  _usedParameters: string[];

  _allUsedParameters(): string[] {
    const result = new Set<string>(this._usedParameters);
    (this.parent! as RunnerSuite)._collectUsedParameters(result);
    return [...result];
  }
}

export class RunnerSuite extends Suite {
  _modifierFn: ModifierFn | null;
  _usedParameters: string[] = [];
  _hooks: { type: string, fn: Function, stack: string } [] = [];

  _collectUsedParameters(result: Set<string>) {
    for (const param of this._usedParameters)
      result.add(param);
    if (this.parent)
      (this.parent as RunnerSuite)._collectUsedParameters(result);
  }

  _assignIds() {
    this.findSpec((test: RunnerSpec) => {
      for (const run of test.tests as RunnerTest[])
        run._id = `${test._ordinal}@${run.spec.file}::[${run._parametersString}]`;
    });
  }

  _addHook(type: string, fn: any, stack: string) {
    this._hooks.push({ type, fn, stack });
  }
}

export class RunnerTest extends Test {
  _parametersString: string;
  _workerHash: string;
  _id: string;
  _repeatEachIndex: number;

  _appendTestResult(): TestResult {
    const result: TestResult = {
      retry: this.results.length,
      workerIndex: 0,
      duration: 0,
      stdout: [],
      stderr: [],
      data: {}
    };
    this.results.push(result);
    return result;
  }
}
