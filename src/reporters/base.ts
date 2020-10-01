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

import { codeFrameColumns } from '@babel/code-frame';
import colors from 'colors/safe';
import fs from 'fs';
import milliseconds from 'ms';
import path from 'path';
import StackUtils from 'stack-utils';
import { TestStatus } from '../ipc';
import { Reporter, Config } from '../runner';
import { Test, Suite, TestResult, Parameters } from '../test';

const stackUtils = new StackUtils();

export class BaseReporter implements Reporter  {
  skipped: Test[] = [];
  asExpected: Test[] = [];
  unexpected = new Set<Test>();
  expectedFlaky: Test[] = [];
  unexpectedFlaky: Test[] = [];
  duration = 0;
  config: Config;
  suite: Suite;
  timeout: number;
  fileDurations = new Map<string, number>();
  monotonicStartTime: number;

  constructor() {
  }

  onBegin(config: Config, suite: Suite) {
    this.monotonicStartTime = monotonicTime();
    this.config = config;
    this.suite = suite;
  }

  onTestBegin(test: Test) {
  }

  onStdOut(chunk: string | Buffer) {
    if (!this.config.quiet)
      process.stdout.write(chunk);
  }

  onStdErr(chunk: string | Buffer) {
    if (!this.config.quiet)
      process.stderr.write(chunk);
  }

  onTestEnd(test: Test, result: TestResult) {
    const spec = test.spec;
    let duration = this.fileDurations.get(spec.file) || 0;
    duration += result.duration;
    this.fileDurations.set(spec.file, duration);

    if (result.status === 'skipped') {
      this.skipped.push(test);
      return;
    }

    if (result.status === test.expectedStatus) {
      if (test.results.length === 1) {
        // as expected from the first attempt
        this.asExpected.push(test);
      } else {
        // as expected after unexpected -> flaky.
        if (test.flaky)
          this.expectedFlaky.push(test);
        else
          this.unexpectedFlaky.push(test);
      }
      return;
    }
    if (result.status === 'passed' || result.status === 'timedOut' || test.results.length === this.config.retries + 1) {
      // We made as many retries as we could, still failing.
      this.unexpected.add(test);
    }
  }

  onError(error: any, file?: string) {
    console.log(formatError(error, file));
  }

  onTimeout(timeout: number) {
    this.timeout = timeout;
  }

  onEnd() {
    this.duration = monotonicTime() - this.monotonicStartTime;
  }

  private _printSlowTests() {
    const fileDurations = [...this.fileDurations.entries()];
    fileDurations.sort((a, b) => b[1] - a[1]);
    let insertedGap = false;
    for (let i = 0; i < 10 && i < fileDurations.length; ++i) {
      const baseName = path.basename(fileDurations[i][0]);
      const duration = fileDurations[i][1];
      if (duration < 15000)
        break;
      if (!insertedGap) {
        insertedGap = true;
        console.log();
      }
      console.log(colors.yellow('  Slow test: ') + baseName + colors.yellow(` (${milliseconds(duration)})`));
    }
    console.log();
  }

  epilogue(full: boolean) {
    console.log(colors.green(`  ${this.asExpected.length} passed`) + colors.dim(` (${milliseconds(this.duration)})`));

    if (this.skipped.length)
      console.log(colors.yellow(`  ${this.skipped.length} skipped`));

    const filteredUnexpected = [...this.unexpected].filter(t => !this.hasResultWithStatus(t, 'timedOut'));
    if (filteredUnexpected.length) {
      console.log(colors.red(`  ${filteredUnexpected.length} failed`));
      if (full) {
        console.log('');
        this._printFailures(filteredUnexpected);
      }
    }

    if (this.expectedFlaky.length)
      console.log(colors.yellow(`  ${this.expectedFlaky.length} expected flaky`));

    if (this.unexpectedFlaky.length) {
      console.log(colors.red(`  ${this.unexpectedFlaky.length} unexpected flaky`));
      if (this.unexpectedFlaky.length) {
        if (full) {
          console.log('');
          this._printFailures(this.unexpectedFlaky);
        }
      }
    }

    const timedOut = [...this.unexpected].filter(t => this.hasResultWithStatus(t, 'timedOut'));
    if (timedOut.length) {
      console.log(colors.red(`  ${timedOut.length} timed out`));
      if (full) {
        console.log('');
        this._printFailures(timedOut);
      }
    }
    if (this.timeout)
      console.log(colors.red(`  Timed out waiting ${this.timeout / 1000}s for the entire test run`));
    this._printSlowTests();
  }

  private _printFailures(failures: Test[]) {
    failures.forEach((test, index) => {
      console.log(this.formatFailure(test, index + 1));
    });
  }

  formatFailure(test: Test, index?: number): string {
    const tokens: string[] = [];
    const spec = test.spec;
    let relativePath = path.relative(this.config.testDir, spec.file) || path.basename(spec.file);
    if (spec.location.includes(spec.file))
      relativePath += spec.location.substring(spec.file.length);
    const passedUnexpectedlySuffix = test.results[0].status === 'passed' ? ' -- passed unexpectedly' : '';
    const header = `  ${index ? index + ')' : ''} ${relativePath} › ${spec.fullTitle()}${passedUnexpectedlySuffix}`;
    tokens.push(colors.bold(colors.red(header)));

    // Print parameters.
    if (test.parameters)
      tokens.push('    ' + ' '.repeat(String(index).length) + colors.gray(serializeParameters(test.parameters)));

    for (const result of test.results) {
      if (result.status === 'passed')
        continue;
      if (result.status === 'timedOut') {
        tokens.push('');
        tokens.push(indent(colors.red(`Timeout of ${test.timeout}ms exceeded.`), '    '));
      } else {
        tokens.push(indent(formatError(result.error, spec.file), '    '));
      }
      break;
    }
    tokens.push('');
    return tokens.join('\n');
  }

  hasResultWithStatus(test: Test, status: TestStatus): boolean {
    return !!test.results.find(r => r.status === status);
  }
}

function formatError(error: any, file?: string) {
  const stack = error.stack;
  const tokens = [];
  if (stack) {
    tokens.push('');
    const messageLocation = error.stack.indexOf(error.message);
    const preamble = error.stack.substring(0, messageLocation + error.message.length);
    tokens.push(preamble);
    const position = file ? positionInFile(stack, file) : null;
    if (position) {
      const source = fs.readFileSync(file, 'utf8');
      tokens.push('');
      tokens.push(codeFrameColumns(source, {
        start: position,
      },
      { highlightCode: true}
      ));
    }
    tokens.push('');
    tokens.push(colors.dim(stack.substring(preamble.length + 1)));
  } else {
    tokens.push('');
    tokens.push(String(error));
  }
  return tokens.join('\n');
}

function indent(lines: string, tab: string) {
  return lines.replace(/^(?=.+$)/gm, tab);
}

function positionInFile(stack: string, file: string): { column: number; line: number; } {
  // Stack will have /private/var/folders instead of /var/folders on Mac.
  file = fs.realpathSync(file);
  for (const line of stack.split('\n')) {
    const parsed = stackUtils.parseLine(line);
    if (!parsed)
      continue;
    if (path.resolve(process.cwd(), parsed.file) === file)
      return {column: parsed.column, line: parsed.line};
  }
  return null;
}

function serializeParameters(parameters: Parameters): string {
  const tokens = [];
  for (const name of Object.keys(parameters))
    tokens.push(`${name}=${parameters[name]}`);
  return tokens.join(', ');
}

function monotonicTime(): number {
  const [seconds, nanoseconds] = process.hrtime();
  return seconds * 1000 + (nanoseconds / 1000000 | 0);
}
