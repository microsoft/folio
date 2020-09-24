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

import program from 'commander';
import * as fs from 'fs';
import { isMatch } from 'micromatch';
import * as path from 'path';
import { Reporter } from './reporter';
import DotReporter from './reporters/dot';
import JSONReporter from './reporters/json';
import LineReporter from './reporters/line';
import ListReporter from './reporters/list';
import { Multiplexer } from './reporters/multiplexer';
import { Runner, Config } from './runner';
import { ParameterRegistration } from './fixtures';

export const reporters = {
  'dot': DotReporter,
  'json': JSONReporter,
  'line': LineReporter,
  'list': ListReporter,
};

const availableReporters = Object.keys(reporters).map(r => `"${r}"`).join();

let runAction: any = runStage1;

program
    .version('Version ' + /** @type {any} */ (require)('../package.json').version)
    .option('--forbid-only', 'Fail if exclusive test(s) encountered', false)
    .option('-g, --grep <grep>', 'Only run tests matching this string or regexp', '.*')
    .option('--global-timeout <timeout>', 'Specify maximum time this test suite can run (in milliseconds), default: 0 for unlimited', '0')
    .option('-j, --jobs <jobs>', 'Number of concurrent jobs for --parallel; use 1 to run in serial, default: (number of CPU cores / 2)', String(Math.ceil(require('os').cpus().length / 2)))
    .option('--output <outputDir>', 'Folder for output artifacts, default: test-results', path.join(process.cwd(), 'test-results'))
    .option('--quiet', 'Suppress stdio', false)
    .option('--repeat-each <repeat-each>', 'Specify how many times to run the tests', '1')
    .option('--reporter <reporter>', `Specify reporter to use, comma-separated, can be ${availableReporters}`, process.env.CI ? 'dot' : 'line')
    .option('--retries <retries>', 'Specify retry count', '0')
    .option('--shard <shard>', 'Shard tests and execute only selected shard, specify in the form "current/all", 1-based, for example "3/5"', '')
    .option('--test-ignore <pattern>', 'Pattern used to ignore test files', '**/node_modules/**')
    .option('--test-match <pattern>', 'Pattern used to find test files', '**/?(*.)+(spec|test).[jt]s')
    .option('--timeout <timeout>', 'Specify test timeout threshold (in milliseconds), default: 10000', '10000')
    .option('--list', 'Only collect all the test and report them')
    .option('-u, --update-snapshots', 'Use this flag to re-record every snapshot that fails during this test run')
    .action(command => runAction(command));

let runner: Runner;
let parameterRegistrations: ParameterRegistration[];
let reporter: Reporter;

program.allowUnknownOption(true);
program.parse(process.argv);

async function runStage1(command) {
  const filteredArguments = [];
  for (const arg of command.args) {
    if (arg.startsWith('-'))
      break;
    filteredArguments.push(arg);
  }

  let shard: { total: number, current: number } | undefined;
  if (command.shard) {
    const pair = command.shard.split('/').map((t: string) => parseInt(t, 10));
    shard = { current: pair[0] - 1, total: pair[1] };
  }
  const testDir = path.resolve(process.cwd(), filteredArguments[0] || '.');
  const config: Config = {
    forbidOnly: command.forbidOnly,
    quiet: command.quiet,
    grep: command.grep,
    jobs: parseInt(command.jobs, 10),
    outputDir: command.output,
    repeatEach: parseInt(command.repeatEach, 10),
    retries: parseInt(command.retries, 10),
    shard,
    snapshotDir: path.join(testDir, '__snapshots__'),
    testDir,
    timeout: parseInt(command.timeout, 10),
    globalTimeout: parseInt(command.globalTimeout, 10),
    updateSnapshots: command.updateSnapshots
  };

  const reporterList = command.reporter.split(',');
  const reporterObjects: Reporter[] = reporterList.map(c => {
    if (reporters[c])
      return new reporters[c]();
    try {
      const p = path.resolve(process.cwd(), c);
      return new (require(p).default)();
    } catch (e) {
      console.error('Invalid reporter ' + c, e);
      process.exit(1);
    }
  });
  let files = [];
  try {
    files = collectFiles(testDir, '', filteredArguments.slice(1), command.testMatch, command.testIgnore);
  } catch (e) {
    // FIXME: figure out where to report fatal errors such as no file / folder.
    // Collecting files failure is a CLI-level error, report it into the console.
    console.log(e);
    process.exit(1);
  }

  reporter = new Multiplexer(reporterObjects);
  runner = new Runner(config, reporter);
  parameterRegistrations = runner.loadFiles(files).parameters;
  runAction = runStage2;
  program.allowUnknownOption(false);
  for (const param of parameterRegistrations)
    program.option(`--${toKebabCase(param.name)}${typeof param.defaultValue === 'boolean' ? '' : ' <value>'}`);
  program.parse(process.argv);
}

async function runStage2(command) {
  const parameters: any = {};
  for (const param of parameterRegistrations) {
    if (param.name in command)
      parameters[param.name] = command[param.name];
  }
  runner.generateTests({ parameters });
  if (command.list) {
    runner.list();
    return;
  }

  try {
    const result = await runner.run();
    if (result === 'forbid-only') {
      console.error('=====================================');
      console.error(' --forbid-only found a focused test.');
      console.error('=====================================');
      process.exit(1);
    }
    if (result === 'no-tests') {
      console.error('=================');
      console.error(' no tests found.');
      console.error('=================');
      process.exit(1);
    }
    process.exit(result === 'failed' ? 1 : 0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

function collectFiles(testDir: string, dir: string, filters: string[], testMatch: string, testIgnore: string): string[] {
  const fullDir = path.join(testDir, dir);
  if (!fs.existsSync(fullDir))
    throw new Error(`${fullDir} does not exist`);
  if (fs.statSync(fullDir).isFile())
    return [fullDir];
  const files = [];
  for (const name of fs.readdirSync(fullDir)) {
    const relativeName = path.join(dir, name);
    if (testIgnore && isMatch(relativeName, testIgnore))
      continue;
    if (fs.lstatSync(path.join(fullDir, name)).isDirectory()) {
      files.push(...collectFiles(testDir, path.join(dir, name), filters, testMatch, testIgnore));
      continue;
    }
    if (testIgnore && !isMatch(relativeName, testMatch))
      continue;
    const fullName = path.join(testDir, relativeName);
    if (!filters.length) {
      files.push(fullName);
      continue;
    }
    for (const filter of filters) {
      if (relativeName.includes(filter)) {
        files.push(fullName);
        break;
      }
    }
  }
  return files;
}

function toKebabCase(name: string): string {
  return name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}
