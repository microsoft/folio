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

import { fixtures as baseFixtures } from '@playwright/test-runner';
import { spawn } from 'child_process';
import * as fs from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import rimraf from 'rimraf';
import { promisify } from 'util';
import type { ReportFormat } from '../src/reporters/json';

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

async function runTest(reportFile: string, outputDir: string, filePath: string, params: any = {}): Promise<RunResult> {
  const testProcess = spawn('node', [
    path.join(__dirname, '..', 'cli.js'),
    path.resolve(__dirname, 'assets', filePath),
    '--output=' + outputDir,
    '--reporter=dot,json',
    '--jobs=2',
    ...Object.keys(params).map(key => params[key] === true ? `--${key}` : `--${key}=${params[key]}`)
  ], {
    env: {
      ...process.env,
      PW_OUTPUT_DIR: outputDir,
      PWRUNNER_JSON_REPORT: reportFile,
    }
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

declare global {
  interface TestState {
    outputDir: string;
    runTest: (filePath: string, options?: any) => Promise<RunResult>;
    runInlineTest: (files: { [key: string]: string }, options?: any) => Promise<RunResult>;
    runInlineFixturesTest: (files: { [key: string]: string }, options?: any) => Promise<RunResult>;
  }
}

export const fixtures = baseFixtures.declareTestFixtures<TestState>();

fixtures.defineTestFixture('outputDir', async ({ testWorkerIndex }, testRun) => {
  await testRun(path.join(__dirname, 'test-results', String(testWorkerIndex)));
});

fixtures.defineTestFixture('runTest', async ({ outputDir, testInfo }, testRun) => {
  const reportFile = path.join(outputDir, `results.json`);
  await removeFolderAsync(outputDir).catch(e => { });
  // Print output on failure.
  let result: RunResult;
  await testRun(async (filePath, options) => {
    result = await runTest(reportFile, outputDir, filePath, options);
    return result;
  });
  if (testInfo.status !== testInfo.expectedStatus)
    console.log(result.output);
});

fixtures.defineTestFixture('runInlineTest', async ({ runTest }, testRun) => {
  await runInlineTest(`
    const { fixtures, expect } = require(${JSON.stringify(path.join(__dirname, '..'))});
    const { it, describe } = fixtures;
  `, runTest, testRun);
});


fixtures.defineTestFixture('runInlineFixturesTest', async ({ runTest }, testRun) => {
  await runInlineTest(`
    const { fixtures: baseFixtures, expect } = require(${JSON.stringify(path.join(__dirname, '..'))});
  `, runTest, testRun);
});

async function runInlineTest(header: string, runTest, testRun) {
  await testRun(async (files, options) => {
    const dir = await fs.promises.mkdtemp(path.join(tmpdir(), 'playwright-test-runInlineTest'));
    await Promise.all(Object.keys(files).map(async name => {
      await fs.promises.writeFile(path.join(dir, name), header + files[name]);
    }));
    const result = await runTest(dir, options);
    await removeFolderAsync(dir);
    return result;
  });
}
