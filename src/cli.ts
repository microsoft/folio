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

import inspector from 'inspector';
import * as commander from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { Runner } from './runner';
import { Config } from './types';
import { forceRegExp } from './util';

const defaultTimeout = 10000;
const defaultReporter = process.env.CI ? 'dot' : 'list';
const builtinReporters = ['list', 'line', 'dot', 'json', 'junit', 'null'];
const tsConfig = 'folio.config.ts';
const jsConfig = 'folio.config.js';
const defaultConfig: Config = {
  preserveOutput: process.env.CI ? 'failures-only' : 'always',
  reporter: [ [defaultReporter] ],
  timeout: defaultTimeout,
  updateSnapshots: process.env.CI ? 'none' : 'missing',
  workers: Math.ceil(require('os').cpus().length / 2),
};

const program = new commander.Command();
program.name('folio');
program.arguments('[test-filter...]');
program.helpOption(false);
program.option('-h, --help', `Display help`);
program.option('-c, --config <file>', `Configuration file, or a test directory with optional "${tsConfig}"/"${jsConfig}"`);
program.option('--forbid-only', `Fail if test.only is called (default: false)`);
program.option('-g, --grep <grep>', `Only run tests matching this regular expression (default: ".*")`);
program.option('--global-timeout <timeout>', `Maximum time this test suite can run in milliseconds (default: unlimited)`);
program.option('-j, --workers <workers>', `Number of concurrent workers, use 1 to run in a single worker (default: number of CPU cores / 2)`);
program.option('--list', `Collect all the tests and report them, but do not run`);
program.option('--max-failures <N>', `Stop after the first N failures`);
program.option('--output <dir>', `Folder for output artifacts (default: "test-results")`);
program.option('--quiet', `Suppress stdio`);
program.option('--repeat-each <N>', `Run each test N times (default: 1)`);
program.option('--reporter <reporter>', `Reporter to use, comma-separated, can be ${builtinReporters.map(name => `"${name}"`).join(', ')} (default: "${defaultReporter}")`);
program.option('--retries <retries>', `Maximum retry count for flaky tests, zero for no retries (default: no retries)`);
program.option('--shard <shard>', `Shard tests and execute only the selected shard, specify in the form "current/all", 1-based, for example "3/5"`);
program.option('--project <project-name>', `Only run tests from the specified project (default: run all projects)`);
program.option('--timeout <timeout>', `Specify test timeout threshold in milliseconds, zero for unlimited (default: ${defaultTimeout})`);
program.option('-u, --update-snapshots', `Update snapshots with actual results (default: only create missing snapshots)`);
program.option('-x', `Stop after the first failure`);
program.version('Folio version ' + require('../package.json').version, '-v, --version', 'Output the version number');
program.parse(process.argv);
(async () => {
  try {
    await runTests(program);
  } catch (e) {
    console.error(e.toString());
    process.exit(1);
  }
})();

async function runTests(program: commander.Command) {
  const opts = program.opts();
  if (opts.help === undefined) {
    console.log(program.helpInformation());
    console.log('');
    console.log('Arguments [test-filter...]:');
    console.log('  Pass arguments to filter test files. Each argument is treated as a regular expression.');
    console.log('');
    console.log('Examples:');
    console.log('  $ folio my.spec.ts');
    console.log('  $ folio -c tests/');
    process.exit(0);
  }

  const runner = new Runner(defaultConfig, overridesFromOptions(opts));

  function loadConfig(configFile: string) {
    if (fs.existsSync(configFile)) {
      if (process.stdout.isTTY)
        console.log(`Using config at ` + configFile);
      runner.loadConfigFile(configFile);
      return true;
    }
    return false;
  }
  if (opts.config) {
    const configFile = path.resolve(process.cwd(), opts.config);
    if (!fs.existsSync(configFile))
      throw new Error(`${opts.config} does not exist`);
    if (fs.statSync(configFile).isDirectory()) {
      // When passed a directory, look for a config file inside.
      // If there is no config, just assume this as a root testing directory.
      if (!loadConfig(path.join(configFile, tsConfig)) && !loadConfig(path.join(configFile, jsConfig)))
        runner.loadEmptyConfig(configFile);
    } else {
      // When passed a file, it must be a config file.
      loadConfig(configFile);
    }
  } else if (!loadConfig(path.resolve(process.cwd(), tsConfig)) && !loadConfig(path.resolve(process.cwd(), jsConfig))) {
    // No --config option, let's look for the config file in the current directory.
    // If not, do not assume that current directory is a root testing directory, to avoid scanning the world.
    throw new Error(`Configuration file not found. Run "folio --help" for more information.`);
  }

  const result = await runner.run(!!opts.list, program.args.map(forceRegExp), opts.project || undefined);
  if (result === 'sigint')
    process.exit(130);
  process.exit(result === 'passed' ? 0 : 1);
}

function overridesFromOptions(options: { [key: string]: any }): Config {
  const shardPair = options.shard ? options.shard.split('/').map((t: string) => parseInt(t, 10)) : undefined;
  const isDebuggerAttached = !!inspector.url();
  return {
    forbidOnly: options.forbidOnly ? true : undefined,
    globalTimeout: isDebuggerAttached ? 0 : (options.globalTimeout ? parseInt(options.globalTimeout, 10) : undefined),
    grep: options.grep ? forceRegExp(options.grep) : undefined,
    maxFailures: options.x ? 1 : (options.maxFailures ? parseInt(options.maxFailures, 10) : undefined),
    outputDir: options.output ? path.resolve(process.cwd(), options.output) : undefined,
    quiet: options.quiet ? options.quiet : undefined,
    repeatEach: options.repeatEach ? parseInt(options.repeatEach, 10) : undefined,
    retries: options.retries ? parseInt(options.retries, 10) : undefined,
    reporter: (options.reporter && options.reporter.length) ? options.reporter.split(',').map(r => [r]) : undefined,
    shard: shardPair ? { current: shardPair[0] - 1, total: shardPair[1] } : undefined,
    timeout: isDebuggerAttached ? 0 : (options.timeout ? parseInt(options.timeout, 10) : undefined),
    updateSnapshots: options.updateSnapshots ? 'all' as const : undefined,
    workers: options.workers ? parseInt(options.workers, 10) : undefined,
  };
}
