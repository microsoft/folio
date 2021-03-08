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

export type TestStatus = 'passed' | 'failed' | 'timedOut' | 'skipped';

export type WorkerInitParams = {
  workerIndex: number;
  fixtureFiles: string[];
};

export type TestBeginPayload = {
  testId: string;
  workerIndex: number,
};

export type TestError = {
  message?: string;
  stack?: string;
  value?: string;
}

export type TestEndPayload = {
  testId: string;
  duration: number;
  status?: TestStatus;
  error?: TestError;
  data: any;
};

export type TestEntry = {
  testId: string;
  retry: number;
  timeout: number;
  expectedStatus: TestStatus;
  skipped: boolean;
};

export type RunPayload = {
  file: string;
  entries: TestEntry[];
  variation: folio.SuiteVariation;  // Note: we should move this to WorkerInitParams.
  variationString: string;  // Note: we should move this to WorkerInitParams.
  hash: string;  // Note: we should move this to WorkerInitParams.
  repeatEachIndex: number;  // Note: we should move this to WorkerInitParams.
};

export type DonePayload = {
  failedTestId?: string;
  fatalError?: any;
  remaining: TestEntry[];
};

export type TestOutputPayload = {
  testId?: string;
  text?: string;
  buffer?: string;
};
