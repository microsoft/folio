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

import { fixtures } from './fixtures';
import * as path from 'path';
import * as fs from 'fs';

type Stabilizer = 'type' | { path: string };
type Stabilizers = { [key: string]: Stabilizer };
type LogFunction = (value: any, title?: string, skipEmpty?: boolean, stabilizers?: Stabilizers) => void;
const builder = fixtures.extend<{}, {}, { log: LogFunction }>();
builder.defineTestFixture('log', async({}, run) => {
  const asciiRegex = new RegExp('[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:[a-zA-Z\\d]*(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)|(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))', 'g');
  const timeRegex = /(\d+(ms|s|h))+/g;

  const logs: string[] = [];
  function logLine(line: string) {
    logs.push(line.replace(asciiRegex, '').replace(timeRegex, '<time>'));
  }

  function log(value: any, title?: string, skipEmpty?: boolean, stabilizers?: Stabilizers) {
    if (typeof value === 'object')
      logValue(value, '', title || '');
    else
      logLine(String(value));

    function logValue(value: any, prefix: string, firstPrefix: string) {
      if (typeof value === 'object' && value !== null) {
        if (Array.isArray(value))
          logArray(value, prefix, firstPrefix);
        else
          logObject(value, prefix, firstPrefix);
      } else {
        const str = String(value);
        const lines = str.split('\n');
        let continuation = '';
        if (firstPrefix.endsWith(' '))
          continuation = ' '.repeat(firstPrefix.length - 2) + '| ';
        else if (firstPrefix.length)
          continuation = ' '.repeat(firstPrefix.length - 1) + '|';
        logLine(firstPrefix + lines[0]);
        for (let i = 1; i < lines.length; i++)
          logLine(continuation + lines[i]);
      }
    }

    function logObject(object: object, prefix: string, firstPrefix: string) {
      const propertyNames = Object.keys(object).filter(name => object.hasOwnProperty(name));
      propertyNames.sort();
      if (!propertyNames.length) {
        if (!skipEmpty)
          logLine(firstPrefix + '{}');
        return;
      }

      logLine(firstPrefix + '{');
      for (let i = 0; i < propertyNames.length; ++i) {
        const name = propertyNames[i];
        const prefixWithName = `  ${prefix}${name}: `;
        let value = object[name];
        if (stabilizers && (name in stabilizers)) {
          const stabilizer = stabilizers[name];
          if (stabilizer === 'type') {
            value = `<${typeof value}>`;
          } else if ('path' in stabilizer) {
            value = String(value);
            let location = '';
            const match = value.match(/:\d+(:\d+)?$/);
            if (match) {
              location = match[0];
              value = value.substring(0, value.length - location.length);
            }
            value = path.relative(stabilizer.path, value) + location;
          } else {
            throw new Error(`Unknown stabilizer ${stabilizer}`);
          }
        }
        logValue(value, '  ' + prefix, prefixWithName);
      }
      logLine(prefix + '}');
    }

    function logArray(array: any[], prefix: string, firstPrefix: string) {
      if (!array.length) {
        if (!skipEmpty)
          logLine(firstPrefix + '[]');
        return;
      }
      logLine(firstPrefix + '[');
      for (let i = 0; i < array.length; ++i)
        logValue(array[i], '  ' + prefix, `  ${prefix}[${i}]: `);
      logLine(prefix + ']');
    }
  }

  await run(log);

  logs.push('');
  expect(logs.join('\n')).toMatchSnapshot();
});
const { it, expect } = builder.build();

const goldenTestsDir = path.join(__dirname, 'golden');
const files = collectFiles(goldenTestsDir, '');
for (const file of files) {
  it(path.relative(goldenTestsDir, file), async({ runTest, log, testInfo }) => {
    const result = await runTest(file);
    log(result, '', true, {
      outputDir: 'type',
      testDir: { path: goldenTestsDir },
      file: { path: goldenTestsDir },
      location: { path: goldenTestsDir },
      duration: 'type',
    });
  });
}

function collectFiles(testDir: string, dir: string): string[] {
  const fullDir = path.join(testDir, dir);
  if (fs.statSync(fullDir).isFile())
    return [fullDir];
  const files = [];
  for (const name of fs.readdirSync(fullDir)) {
    const relativeName = path.join(dir, name);
    if (fs.lstatSync(path.join(fullDir, name)).isDirectory()) {
      files.push(...collectFiles(testDir, path.join(dir, name)));
      continue;
    }
    if (relativeName.match(/\.(spec|test)\.(js|ts)$/))
      files.push(path.join(testDir, relativeName));
  }
  return files;
}
