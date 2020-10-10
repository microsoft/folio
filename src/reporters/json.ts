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

import fs from 'fs';
import path from 'path';
import { Config } from '../config';
import { EmptyReporter } from '../reporter';
import { Test, Suite, Spec, TestResult, TestError } from '../test';
import { ENV_PREFIX } from './base';

export interface SerializedSuite {
  title: string;
  file: string;
  location: string,
  specs: ReturnType<JSONReporter['_serializeTestSpec']>[];
  suites?: SerializedSuite[];
}

export type ReportFormat = {
  config: Config;
  errors?: { file: string, error: TestError }[];
  suites?: SerializedSuite[];
};

class JSONReporter extends EmptyReporter {
  config: Config;
  suite: Suite;
  private _errors: { file: string, error: TestError }[] = [];

  onBegin(config: Config, suite: Suite) {
    this.config = config;
    this.suite = suite;
  }

  onTimeout() {
    this.onEnd();
  }

  onError(error: TestError, file?: string): void {
    this._errors.push({ file, error });
  }

  onEnd() {
    outputReport({
      config: this.config,
      suites: this.suite.suites.map(suite => this._serializeSuite(suite)).filter(s => s),
      errors: this._errors
    });
  }

  private _serializeSuite(suite: Suite): null | SerializedSuite {
    if (!suite.findSpec(test => true))
      return null;
    const suites = suite.suites.map(suite => this._serializeSuite(suite)).filter(s => s);
    return {
      title: suite.title,
      file: suite.file,
      location: suite.location,
      specs: suite.specs.map(test => this._serializeTestSpec(test)),
      suites: suites.length ? suites : undefined,
    };
  }

  private _serializeTestSpec(spec: Spec) {
    return {
      title: spec.title,
      file: spec.file,
      location: spec.location,
      tests: spec.tests.map(r => this._serializeTest(r))
    };
  }

  private _serializeTest(test: Test) {
    return {
      slow: test.slow,
      timeout: test.timeout,
      annotations: test.annotations,
      expectedStatus: test.expectedStatus,
      parameters: test.parameters,
      // TODO: rename to results.
      runs: test.results.map(r => this._serializeTestResult(r))
    };
  }

  private _serializeTestResult(result: TestResult) {
    return {
      workerIndex: result.workerIndex,
      status: result.status,
      duration: result.duration,
      error: result.error,
      stdout: result.stdout.map(s => stdioEntry(s)),
      stderr: result.stderr.map(s => stdioEntry(s)),
      data: result.data,
      retry: result.retry,
    };
  }
}

function outputReport(report: ReportFormat) {
  const reportString = JSON.stringify(report, undefined, 2);
  const outputName = process.env[`${ENV_PREFIX}_JSON_OUTPUT_NAME`];
  if (outputName) {
    fs.mkdirSync(path.dirname(outputName), { recursive: true });
    fs.writeFileSync(outputName, reportString);
  } else {
    console.log(reportString);
  }
}

function stdioEntry(s: string | Buffer): any {
  if (typeof s === 'string')
    return { text: s };
  return { buffer: s.toString('base64') };
}

export default JSONReporter;
