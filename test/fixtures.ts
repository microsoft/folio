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

import { folio as base, TestInfo } from 'folio';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { ReportFormat } from '../src/reporters/json';
export { config } from 'folio';

export type RunResult = {
  exitCode: number,
  output: string,
  passed: number,
  failed: number,
  flaky: number,
  skipped: number,
  report: ReportFormat,
  results: any[],
};

type Files = { [key: string]: string | Buffer };
type Params = { [key: string]: string | number | boolean | string[] };

async function innerRunTest(testInfo: TestInfo, header: string, files: { [key: string]: string | Buffer }, params: any = {}): Promise<RunResult> {
  const baseDir = testInfo.outputPath();

  await Promise.all(Object.keys(files).map(async name => {
    const fullName = path.join(baseDir, name);
    await fs.promises.mkdir(path.dirname(fullName), { recursive: true });
    if (fullName.endsWith('.js') || fullName.endsWith('.ts'))
      await fs.promises.writeFile(fullName, header + files[name]);
    else
      await fs.promises.writeFile(fullName, files[name]);
  }));

  let testDir = '.';
  const paramList = [];
  for (const key of Object.keys(params)) {
    if (key === 'testDir') {
      testDir = params[key];
      continue;
    }
    for (const value of  Array.isArray(params[key]) ? params[key] : [params[key]]) {
      const k = key.startsWith('-') ? key : '--' + key;
      paramList.push(params[key] === true ? `${k}` : `${k}=${value}`);
    }
  }
  const outputDir = path.join(baseDir, 'test-results');
  const reportFile = path.join(outputDir, 'report.json');
  const testProcess = spawn('node', [
    path.join(__dirname, '..', 'cli.js'),
    testDir,
    '--output=' + outputDir,
    '--reporter=dot,json',
    '--workers=2',
    ...paramList
  ], {
    env: {
      ...process.env,
      FOLIO_JSON_OUTPUT_NAME: reportFile,
    },
    cwd: baseDir
  });
  let output = '';
  testProcess.stderr.on('data', chunk => {
    output += String(chunk);
    if (process.env.PW_RUNNER_DEBUG)
      process.stderr.write(String(chunk));
  });
  testProcess.stdout.on('data', chunk => {
    output += String(chunk);
    if (process.env.PW_RUNNER_DEBUG)
      process.stdout.write(String(chunk));
  });
  const status = await new Promise<number>(x => testProcess.on('close', x));
  const passed = (/(\d+) passed/.exec(output.toString()) || [])[1] || '0';
  const failed = (/(\d+) failed/.exec(output.toString()) || [])[1] || '0';
  const flaky = (/(\d+) flaky/.exec(output.toString()) || [])[1] || '0';
  const skipped = (/(\d+) skipped/.exec(output.toString()) || [])[1] || '0';
  let report;
  try {
    report = JSON.parse(fs.readFileSync(reportFile).toString());
  } catch (e) {
    output += '\n' + e.toString();
  }

  const results = [];
  function visitSuites(suites?: ReportFormat['suites']) {
    if (!suites)
      return;
    for (const suite of suites) {
      for (const spec of suite.specs) {
        for (const test of spec.tests)
          results.push(...test.runs);
      }
      visitSuites(suite.suites);
    }
  }
  if (report)
    visitSuites(report.suites);

  return {
    exitCode: status,
    output,
    passed: parseInt(passed, 10),
    failed: parseInt(failed, 10),
    flaky: parseInt(flaky, 10),
    skipped: parseInt(skipped, 10),
    report,
    results,
  };
}

type TestState = {
  runInlineTest: (files: Files, params?: Params) => Promise<RunResult>;
  runInlineFixturesTest: (files: Files, params?: Params) => Promise<RunResult>;
};

const fixtures = base.extend<{}, TestState>();

fixtures.runInlineTest.init(async ({ testInfo }, run) => {
  const header = `
    const { folio, expect, config } = require(${JSON.stringify(path.join(__dirname, '..'))});
    const { it, fit, xit, test, describe, xdescribe, fdescribe, beforeEach, beforeAll, afterEach, afterAll } = folio;
  `;
  let result: RunResult;
  await run(async (files, options) => {
    result = await innerRunTest(testInfo, header, files, options);
    return result;
  });
  if (testInfo.status !== testInfo.expectedStatus)
    console.log(result.output);
});

fixtures.runInlineFixturesTest.init(async ({ testInfo }, run) => {
  const header = `
    const { folio: baseFolio, expect, config } = require(${JSON.stringify(path.join(__dirname, '..'))});
  `;
  let result: RunResult;
  await run(async (files, options) => {
    result = await innerRunTest(testInfo, header, files, options);
    return result;
  });
  if (testInfo.status !== testInfo.expectedStatus)
    console.log(result.output);
});

export const folio = fixtures.build();

const asciiRegex = new RegExp('[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:[a-zA-Z\\d]*(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)|(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))', 'g');
export function stripAscii(str: string): string {
  return str.replace(asciiRegex, '');
}

export function firstStackFrame(stack: string): string {
  return stack.split('\n').find(line => line.trim().startsWith('at'));
}
