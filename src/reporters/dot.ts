/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import colors from 'colors/safe';
import { BaseReporter } from './base';
import { Test, TestResult } from '../test';

class DotReporter extends BaseReporter {
  private _counter = 0;

  onTestEnd(test: Test, result: TestResult) {
    super.onTestEnd(test, result);
    if (result.status === 'skipped') {
      process.stdout.write(colors.yellow('∘'));
    } else if (result.status !== test.expectedStatus && result.status !== 'passed' && test.results.length <= this.config.retries) {
      process.stdout.write(colors.red('◍'));
    } else if (result.status === 'timedOut') {
      process.stdout.write(colors.red('T'));
    } else if (result.status === 'failed') {
      process.stdout.write(result.status === test.expectedStatus ? colors.green('f') : colors.red('F'));
    } else if (result.status === 'passed') {
      process.stdout.write(result.status === test.expectedStatus ? (test.results.length > 1 ? colors.yellow('Ⓟ') : colors.green('·')) : colors.red('P'));
    }
    if (++this._counter === 80)
      process.stdout.write('\n');
  }

  onTimeout(timeout) {
    super.onTimeout(timeout);
    this.onEnd();
  }

  onEnd() {
    super.onEnd();
    process.stdout.write('\n');
    this.epilogue(true);
  }
}

export default DotReporter;
