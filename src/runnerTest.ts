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

export class RunnerSpec extends Spec {
}

export class RunnerSuite extends Suite {
}

export class RunnerTest extends Test {
  // Note that variation string is equal to worker hash.
  _variationString: string;
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
