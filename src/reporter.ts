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

import { Config, TestResult, Test, Suite, TestError } from './types';

export interface Reporter {
  onBegin(config: Config, suite: Suite): void;
  onTestBegin(test: Test): void;
  onStdOut(chunk: string | Buffer, test?: Test): void;
  onStdErr(chunk: string | Buffer, test?: Test): void;
  onTestEnd(test: Test, result: TestResult): void;
  onTimeout(timeout: number): void;
  onError(error: TestError): void;
  onEnd(): void;
}

export class EmptyReporter implements Reporter {
  onBegin(config: Config, suite: Suite) {}
  onTestBegin(test: Test) {}
  onStdOut(chunk: string | Buffer, test?: Test) {}
  onStdErr(chunk: string | Buffer, test?: Test) {}
  onTestEnd(test: Test, result: TestResult) {}
  onTimeout(timeout: number) {}
  onError(error: TestError) {}
  onEnd() {}
}
