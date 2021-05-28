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

import * as commander from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { Runner } from './runner';
import { forceRegExp } from './util';

const program = new commander.Command();
program.name('folio');
program.helpOption(false);
program.allowUnknownOption();
program.version('Folio version ' + require('../package.json').version, '-v, --version', 'Output the version number');
for (const { flags, description } of Runner.commonOptions(10000))
  program.option(flags, description);
program.option('-c, --config <file>', `Configuration file (default: "folio.config.ts" or "folio.config.js")`);
program.option('-h, --help', `Display help`);
const builtinOptions = new Set<string>(program.options.filter(o => !!o.long).map(o => o.long.substring(2)));
program.parse(process.argv);
(async () => {
  try {
    await runTests(program, builtinOptions);
  } catch (e) {
    console.error(e.toString());
    process.exit(1);
  }
})();

async function runTests(program: commander.Command, builtinOptions: Set<string>) {
  const opts = program.opts();
  const extraOptions: string[] = [];

  const runner = new Runner(Runner.configFromOptions(opts), 10000, cliOption => {
    if (cliOption.name.length <= 1)
      throw new Error(`CLI option "${cliOption.name}" is too short`);
    if (builtinOptions.has(cliOption.name))
      throw new Error(`CLI option "${cliOption.name}" is reserved`);
    switch (cliOption.type) {
      case 'boolean':
        program.option(`--${cliOption.name}`, cliOption.description);
        break;
      case 'string':
        program.option(`--${cliOption.name} <value>`, cliOption.description);
        break;
      case 'list':
        program.option(`--${cliOption.name} <values...>`, cliOption.description);
        break;
    }
    extraOptions.push(cliOption.name);
    program.parse(process.argv);
    return program.opts()[cliOption.name];
  });

  const help = opts.help === undefined;

  function loadConfig(configFile: string) {
    if (fs.existsSync(configFile)) {
      if (process.stdout.isTTY)
        console.log(`Using config at ` + configFile);
      runner.loadConfigFile(configFile);
      return true;
    }
    return false;
  }
  const tsConfig = 'folio.config.ts';
  const jsConfig = 'folio.config.js';
  if (opts.config) {
    const configFile = path.resolve(process.cwd(), opts.config);
    if (!fs.existsSync(configFile))
      throw new Error(`${opts.config} does not exist`);
    if (fs.statSync(configFile).isDirectory()) {
      // When passed a directory, look for a config file inside.
      // If there is no config, just assume this as a root testing directory.
      if (!loadConfig(path.join(configFile, tsConfig)) && !loadConfig(path.join(configFile, jsConfig)))
        runner.loadEmptyConfig({}, configFile);
    } else {
      // When passed a file, it must be a config file.
      loadConfig(path.resolve(process.cwd(), opts.config));
    }
  } else if (!loadConfig(path.resolve(process.cwd(), tsConfig)) && !loadConfig(path.resolve(process.cwd(), jsConfig)) && !help) {
    // No --config option, let's look for the config file in the current directory.
    // If not, do not assume that current directory is a root testing directory, to avoid scanning the world.
    throw new Error(`Configuration file not found. Run "folio --help" for more information.`);
  }

  if (help) {
    const builtinHelp: string[] = [];
    const extraHelp: string[] = [];
    for (const line of program.helpInformation().split('\n').slice(3)) {
      if (extraOptions.some(e => line.includes('--' + e)))
        extraHelp.push(line);
      else
        builtinHelp.push(line);
    }
    const lines: string[] = [];
    lines.push(`Usage: folio [options] <filter...>`);
    lines.push(``);
    lines.push(`Use <filter...> arguments to filter test files. Each argument is treated as a regular expression.`);
    lines.push(``);
    if (extraHelp.length) {
      lines.push(`Test suite options:`);
      lines.push(...extraHelp);
      lines.push('');
      lines.push(`General options:`);
    } else {
      lines.push(`Options:`);
    }
    lines.push(...builtinHelp);
    console.log(lines.join('\n'));
    process.exit(0);
  }

  program.allowUnknownOption(false);
  program.parse(process.argv);

  const result = await runner.run(!!opts.list, program.args.map(forceRegExp), opts.project || undefined);
  if (result === 'sigint')
    process.exit(130);
  process.exit(result === 'passed' ? 0 : 1);
}
