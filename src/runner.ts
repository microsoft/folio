/**
 * Copyright 2019 Google Inc. All rights reserved.
 * Modifications copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import rimraf from 'rimraf';
import { promisify } from 'util';
import { Dispatcher } from './dispatcher';
import { config } from './fixtures';
import { Reporter } from './reporter';
import { generateTests } from './testGenerator';
import { monotonicTime, prependErrorMessage, raceAgainstDeadline } from './util';
import { debugLog } from './debug';
import { RootSuite, Suite } from './test';
import { FixtureLoader } from './fixtureLoader';
import { installTransform } from './transform';
import { clearCurrentFile, setCurrentFile } from './spec';
export { Reporter } from './reporter';
export { Test, TestResult, Suite, TestStatus, TestError } from './types';

const removeFolderAsync = promisify(rimraf);

type RunResult = 'passed' | 'failed' | 'sigint' | 'forbid-only' | 'no-tests';

export class Runner {
  private _reporter: Reporter;
  private _suites: RootSuite[] = [];
  private _fixtureLoader: FixtureLoader;
  private _rootSuite: Suite;

  constructor(reporter: Reporter) {
    this._reporter = reporter;
    this._fixtureLoader = new FixtureLoader();
  }

  loadFixtures(files: string[]) {
    debugLog(`loadFixtures`, files);
    for (const file of files) {
      try {
        this._fixtureLoader.loadFixtureFile(file);
      } catch (e) {
        prependErrorMessage(e, `Error while reading ${file}:\n`);
        throw e;
      }
    }
    this._fixtureLoader.finish();
  }

  loadFiles(files: string[]) {
    debugLog(`loadFiles`, files);
    for (const file of files) {
      const revertBabelRequire = installTransform();
      setCurrentFile(file, this._suites, this._fixtureLoader.fixturePool);
      try {
        require(file);
      } catch (e) {
        prependErrorMessage(e, `Error while reading ${file}:\n`);
        throw e;
      }
      clearCurrentFile();
      revertBabelRequire();
    }
  }

  generateTests() {
    this._suites = excludeNonOnlyFiles(this._suites);
    this._rootSuite = generateTests(this._suites, config, this._fixtureLoader);
  }

  list() {
    this._reporter.onBegin(config, this._rootSuite);
    this._reporter.onEnd();
  }

  async run(): Promise<RunResult> {
    await removeFolderAsync(config.outputDir).catch(e => {});

    if (config.forbidOnly) {
      const hasOnly = this._rootSuite.findSpec(t => t._only) || this._rootSuite.findSuite(s => s._only);
      if (hasOnly)
        return 'forbid-only';
    }

    const total = this._rootSuite.totalTestCount();
    if (!total)
      return 'no-tests';
    const globalDeadline = config.globalTimeout ? config.globalTimeout + monotonicTime() : 0;
    const { result, timedOut } = await raceAgainstDeadline(this._runTests(this._rootSuite), globalDeadline);
    if (timedOut) {
      this._reporter.onTimeout(config.globalTimeout);
      process.exit(1);
    }
    return result;
  }

  private async _runTests(suite: Suite): Promise<RunResult> {
    // Trial run does not need many workers, use one.
    const runner = new Dispatcher(suite, config, this._fixtureLoader.fixtureFiles, this._reporter);
    let sigint = false;
    let sigintCallback: () => void;
    const sigIntPromise = new Promise<void>(f => sigintCallback = f);
    const sigintHandler = () => {
      process.off('SIGINT', sigintHandler);
      sigint = true;
      sigintCallback();
    };
    process.on('SIGINT', sigintHandler);
    this._reporter.onBegin(config, suite);
    await Promise.race([runner.run(), sigIntPromise]);
    await runner.stop();
    this._reporter.onEnd();
    if (sigint)
      return 'sigint';
    return runner.hasWorkerErrors() || suite.findSpec(spec => !spec.ok()) ? 'failed' : 'passed';
  }
}

function excludeNonOnlyFiles(suites: RootSuite[]): RootSuite[] {
  // This makes sure we don't generate 1000000 tests if only one spec is focused.
  const filtered = suites.filter(suite => suite._hasOnly());
  return filtered.length === 0 ? suites : filtered;
}