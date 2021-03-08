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
import * as path from 'path';
import { Config } from '../config';
import { BaseReporter, formatFailure, serializeVariation } from './base';
import { Test, Suite, TestResult } from '../test';

class LineReporter extends BaseReporter {
  private _total: number;
  private _current = 0;
  private _failures = 0;
  private _lastTest: Test;
  private _variationSnapshot: folio.SuiteVariation;
  private _variationKeysToPreview = new Set<string>();

  onBegin(config: Config, suite: Suite) {
    super.onBegin(config, suite);
    this._total = suite.total;
    console.log();
  }

  onStdOut(chunk: string | Buffer, test?: Test) {
    this._dumpToStdio(test, chunk, process.stdout);
  }

  onStdErr(chunk: string | Buffer, test?: Test) {
    this._dumpToStdio(test, chunk, process.stderr);
  }

  private _dumpToStdio(test: Test | undefined, chunk: string | Buffer, stream: NodeJS.WriteStream) {
    if (this.config.quiet)
      return;
    stream.write(`\u001B[1A\u001B[2K`);
    if (test && this._lastTest !== test) {
      // Write new header for the output.
      stream.write(colors.gray(`${path.basename(test.spec.file)} - ${test.spec.fullTitle()}\n`));
      this._lastTest = test;
    }

    stream.write(chunk);
    console.log();
  }

  onTestEnd(test: Test, result: TestResult) {
    super.onTestEnd(test, result);
    const spec = test.spec;
    const baseName = path.basename(spec.file);
    const width = process.stdout.columns - 1;
    const title = `[${++this._current}/${this._total}] ${baseName} - ${spec.fullTitle()}`.substring(0, width);
    const params = title.length < width ? this._parametersString(test).substring(0, width - title.length) : '';
    process.stdout.write(`\u001B[1A\u001B[2K${title}${colors.gray(params)}\n`);
    if (!this.willRetry(test, result) && !test.ok()) {
      process.stdout.write(`\u001B[1A\u001B[2K`);
      console.log(formatFailure(this.config, test, ++this._failures));
      console.log();
    }
  }

  onEnd() {
    process.stdout.write(`\u001B[1A\u001B[2K`);
    super.onEnd();
    this.epilogue(false);
  }

  private _parametersString(test: Test): string {
    if (!this._variationSnapshot) {
      this._variationSnapshot = { ...test.variation };
      return '';
    }

    // Collect names of parameters that have different values.
    for (const key of Object.keys(test.variation)) {
      if (this._variationSnapshot[key] !== test.variation[key])
        this._variationKeysToPreview.add(key);
    }

    const preview = {};
    for (const key of this._variationKeysToPreview)
      preview[key] = test.variation[key];
    if (Object.keys(preview).length)
      return ' [' + serializeVariation(preview) + ']';
    else
      return '';
  }
}

export default LineReporter;
