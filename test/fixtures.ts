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

import { config, fixtures as baseFixtures } from '@playwright/test-runner';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import rimraf from 'rimraf';
import { promisify } from 'util';
import type { ReportFormat } from '../src/reporters/json';
export { config } from '@playwright/test-runner';

const removeFolderAsync = promisify(rimraf);

export type RunResult = {
  exitCode: number,
  output: string,
  passed: number,
  failed: number,
  timedOut: number,
  expectedFlaky: number,
  unexpectedFlaky: number,
  skipped: number,
  report: ReportFormat,
  results: any[],
};

async function innerRunTest(baseDir: string, filePath: string, outputDir: string, params: any = {}): Promise<RunResult> {
  const paramList = [];
  for (const key of Object.keys(params)) {
    for (const value of  Array.isArray(params[key]) ? params[key] : [params[key]]) {
      const k = key.startsWith('-') ? key : '--' + key;
      paramList.push(params[key] === true ? `${k}` : `${k}=${value}`);
    }
  }
  const reportFile = path.join(outputDir, 'report.json');
  const testProcess = spawn('node', [
    path.join(__dirname, '..', 'cli.js'),
    filePath,
    '--output=' + outputDir,
    '--reporter=dot,json',
    '--workers=2',
    ...paramList
  ], {
    env: {
      ...process.env,
      PW_OUTPUT_DIR: outputDir,
      PWRUNNER_JSON_REPORT: reportFile,
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
  const passed = (/(\d+) passed/.exec(output.toString()) || [])[1];
  const failed = (/(\d+) failed/.exec(output.toString()) || [])[1];
  const timedOut = (/(\d+) timed out/.exec(output.toString()) || [])[1];
  const expectedFlaky = (/(\d+) expected flaky/.exec(output.toString()) || [])[1];
  const unexpectedFlaky = (/(\d+) unexpected flaky/.exec(output.toString()) || [])[1];
  const skipped = (/(\d+) skipped/.exec(output.toString()) || [])[1];
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
    failed: parseInt(failed || '0', 10),
    timedOut: parseInt(timedOut || '0', 10),
    expectedFlaky: parseInt(expectedFlaky || '0', 10),
    unexpectedFlaky: parseInt(unexpectedFlaky || '0', 10),
    skipped: parseInt(skipped || '0', 10),
    report,
    results,
  };
}

type TestState = {
  runTest: (filePath: string, options?: any) => Promise<RunResult>;
  runInlineTest: (files: { [key: string]: string }, options?: any) => Promise<RunResult>;
  runInlineFixturesTest: (files: { [key: string]: string }, options?: any) => Promise<RunResult>;
};

export const fixtures = baseFixtures.declareTestFixtures<TestState>();

fixtures.defineTestFixture('runTest', async ({ testOutputPath, testInfo }, testRun) => {
  // Print output on failure.
  let result: RunResult;
  await testRun(async (filePath, options) => {
    const target = path.join(config.testDir, 'assets', filePath);
    let isDir = false;
    try {
      isDir = fs.statSync(target).isDirectory();
    } catch (e) {
    }
    if (isDir)
      result = await innerRunTest(path.join(config.testDir, 'assets', filePath), '.', testOutputPath('output'), options);
    else
      result = await innerRunTest(path.join(config.testDir, 'assets'), filePath, testOutputPath('output'), options);
    return result;
  });
  if (testInfo.status !== testInfo.expectedStatus)
    console.log(result.output);
});

fixtures.defineTestFixture('runInlineTest', async ({ testOutputPath, testInfo }, runTest) => {
  await runInlineTest(testOutputPath, `
    const { fixtures, expect } = require(${JSON.stringify(path.join(__dirname, '..'))});
    const { it, describe } = fixtures;
  `, testInfo, runTest);
});


fixtures.defineTestFixture('runInlineFixturesTest', async ({ testOutputPath, testInfo }, runTest) => {
  await runInlineTest(testOutputPath, `
    const { fixtures: baseFixtures, expect } = require(${JSON.stringify(path.join(__dirname, '..'))});
  `, testInfo, runTest);
});

async function runInlineTest(testOutputPath: (...name: string[]) => string, header: string, testInfo, runTest) {
  const baseDir = testOutputPath();
  let result: RunResult;
  await runTest(async (files: string[], options) => {
    await Promise.all(Object.keys(files).map(async name => {
      const fullName = path.join(baseDir, name);
      const actualHeader = fullName.endsWith('.js') || fullName.endsWith('.ts') ? header : '';
      await fs.promises.mkdir(path.dirname(fullName), { recursive: true });
      await fs.promises.writeFile(fullName, actualHeader + files[name]);
    }));
    result = await innerRunTest(baseDir, '.', path.join(baseDir, 'test-results'), options);
    return result;
  });
  if (testInfo.status !== testInfo.expectedStatus)
    console.log(result.output);
}
