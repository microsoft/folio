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

import * as folio from 'folio';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { ReportFormat } from '../src/reporters/json';

type RunResult = {
  exitCode: number,
  output: string,
  passed: number,
  failed: number,
  flaky: number,
  skipped: number,
  report: ReportFormat,
  results: any[],
};

type TSCResult = {
  output: string;
  exitCode: number;
};

type Files = { [key: string]: string | Buffer };
type Params = { [key: string]: string | number | boolean | string[] };

async function writeFiles(testInfo: folio.TestInfo, files: Files) {
  const baseDir = testInfo.outputPath();

  const headerJS = `
    const folio = require(${JSON.stringify(path.join(__dirname, '..'))});
  `;
  const headerTS = `
    import * as folio from ${JSON.stringify(path.join(__dirname, '..'))};
  `;

  const hasConfig = Object.keys(files).some(name => name.includes('.config.'));
  if (!hasConfig) {
    files = {
      ...files,
      'folio.config.ts': `
        export const test = folio.test;
        test.runWith();
      `,
    };
  }

  await Promise.all(Object.keys(files).map(async name => {
    const fullName = path.join(baseDir, name);
    await fs.promises.mkdir(path.dirname(fullName), { recursive: true });
    const isTypeScriptSourceFile = name.endsWith('ts') && !name.endsWith('d.ts');
    const header = isTypeScriptSourceFile ? headerTS : headerJS;
    const testHeader = header + `const { expect } = folio;`;
    if (/(spec|test)\.(js|ts)$/.test(name)) {
      let fileHeader = testHeader + '\n';
      if (!hasConfig) {
        const configPath = path.join(baseDir, 'folio.config');
        let relativePath = path.relative(path.dirname(fullName), configPath);
        if (os.platform() === 'win32')
          relativePath = relativePath.replace(/\\/g, '/');
        if (isTypeScriptSourceFile)
          fileHeader = testHeader + `import { test } from './${relativePath}';\n`;
        else
          fileHeader = testHeader + `const { test } = require('./${relativePath}');\n`;
      }
      await fs.promises.writeFile(fullName, fileHeader + files[name]);
    } else if (/\.(js|ts)$/.test(name) && !name.endsWith('d.ts')) {
      await fs.promises.writeFile(fullName, header + files[name]);
    } else {
      await fs.promises.writeFile(fullName, files[name]);
    }
  }));

  return baseDir;
}

async function runTSC(baseDir: string): Promise<TSCResult> {
  const tscProcess = spawn('npx', ['tsc', '-p', baseDir], {
    cwd: baseDir,
    shell: true,
  });
  let output = '';
  tscProcess.stderr.on('data', chunk => {
    output += String(chunk);
    if (process.env.PW_RUNNER_DEBUG)
      process.stderr.write(String(chunk));
  });
  tscProcess.stdout.on('data', chunk => {
    output += String(chunk);
    if (process.env.PW_RUNNER_DEBUG)
      process.stdout.write(String(chunk));
  });
  const status = await new Promise<number>(x => tscProcess.on('close', x));
  return {
    exitCode: status,
    output,
  };
}

async function runFolio(baseDir: string, params: any, env: any): Promise<RunResult> {
  const paramList = [];
  let additionalArgs = '';
  for (const key of Object.keys(params)) {
    if (key === 'args') {
      additionalArgs = params[key];
      continue;
    }
    for (const value of Array.isArray(params[key]) ? params[key] : [params[key]]) {
      const k = key.startsWith('-') ? key : '--' + key;
      paramList.push(params[key] === true ? `${k}` : `${k}=${value}`);
    }
  }
  const outputDir = path.join(baseDir, 'test-results');
  const reportFile = path.join(outputDir, 'report.json');
  const args = [path.join(__dirname, '..', 'cli.js')];
  args.push(
      '--output=' + outputDir,
      '--reporter=dot,json',
      '--workers=2',
      ...paramList
  );
  if (additionalArgs)
    args.push(...additionalArgs);
  const testProcess = spawn('node', args, {
    env: {
      ...process.env,
      ...env,
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
          results.push(...test.results);
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

type TestArgs = {
  writeFiles: (files: Files) => void;
  runInlineTest: (files: Files, params?: Params, env?: any) => Promise<RunResult>;
  runTSC: (files: Files) => Promise<TSCResult>;
};

class Env implements folio.Env<TestArgs> {
  private _runResult: RunResult | undefined;
  private _tscResult: TSCResult | undefined;

  private async _writeFiles(testInfo: folio.TestInfo, files: Files) {
    return writeFiles(testInfo, files);
  }

  private async _runInlineTest(testInfo: folio.TestInfo, files: Files, options: Params = {}, env: any = {}) {
    const baseDir = await this._writeFiles(testInfo, files);
    this._runResult = await runFolio(baseDir, options, env);
    return this._runResult;
  }

  private async _runTSC(testInfo: folio.TestInfo, files: Files) {
    const baseDir = await this._writeFiles(testInfo, { ...files, 'tsconfig.json': JSON.stringify(TSCONFIG) });
    this._tscResult = await runTSC(baseDir);
    return this._tscResult;
  }

  async beforeEach(testInfo: folio.TestInfo) {
    return {
      writeFiles: this._writeFiles.bind(this, testInfo),
      runInlineTest: this._runInlineTest.bind(this, testInfo),
      runTSC: this._runTSC.bind(this, testInfo),
    };
  }

  async afterEach(testInfo: folio.TestInfo) {
    if (testInfo.status !== testInfo.expectedStatus) {
      if (this._runResult)
        console.log(this._runResult.output);
      if (this._tscResult)
        console.log(this._tscResult.output);
    }
    this._runResult = undefined;
    this._tscResult = undefined;
  }
}

const TSCONFIG = {
  'compilerOptions': {
    'target': 'ESNext',
    'moduleResolution': 'node',
    'module': 'commonjs',
    'strict': true,
    'esModuleInterop': true,
    'allowSyntheticDefaultImports': true,
    'rootDir': '.',
    'lib': ['esnext']
  },
  'exclude': [
    'node_modules'
  ]
};

const asciiRegex = new RegExp('[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:[a-zA-Z\\d]*(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)|(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))', 'g');
export function stripAscii(str: string): string {
  return str.replace(asciiRegex, '');
}

folio.setConfig({
  testDir: __dirname,
  testIgnore: 'assets/**',
  timeout: 20000,
  forbidOnly: !!process.env.CI,
});

export { expect } from 'folio';
export const test = folio.newTestType<TestArgs>();
test.runWith(new Env());
