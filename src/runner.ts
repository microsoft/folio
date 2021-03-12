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
import { Reporter } from './reporter';
import { generateTests } from './testGenerator';
import { monotonicTime, raceAgainstDeadline } from './util';
import { RootSuite, Suite } from './test';
import { Loader } from './loader';
export { Reporter } from './reporter';
export { Test, TestResult, Suite, TestStatus, TestError } from './types';

const removeFolderAsync = promisify(rimraf);

type RunResult = 'passed' | 'failed' | 'sigint' | 'forbid-only' | 'no-tests';

export class Runner {
  private _reporter: Reporter;
  private _loader: Loader;
  private _rootSuite: Suite;

  constructor(loader: Loader, reporter: Reporter) {
    this._reporter = reporter;
    this._loader = loader;
    this._rootSuite = generateTests(excludeNonOnlyFiles(loader.suites), this._loader);
  }

  list() {
    this._reporter.onBegin(this._loader.config(), this._rootSuite);
    this._reporter.onEnd();
  }

  async run(): Promise<RunResult> {
    await removeFolderAsync(this._loader.config().outputDir).catch(e => {});

    if (this._loader.config().forbidOnly) {
      const hasOnly = this._rootSuite.findSpec(t => t._only) || this._rootSuite.findSuite(s => s._only);
      if (hasOnly)
        return 'forbid-only';
    }

    const total = this._rootSuite.totalTestCount();
    if (!total)
      return 'no-tests';
    const globalDeadline = this._loader.config().globalTimeout ? this._loader.config().globalTimeout + monotonicTime() : 0;
    const { result, timedOut } = await raceAgainstDeadline(this._runTests(this._rootSuite), globalDeadline);
    if (timedOut) {
      this._reporter.onTimeout(this._loader.config().globalTimeout);
      process.exit(1);
    }
    return result;
  }

  private async _runTests(suite: Suite): Promise<RunResult> {
    // Trial run does not need many workers, use one.
    const runner = new Dispatcher(this._loader, suite, this._reporter);
    let sigint = false;
    let sigintCallback: () => void;
    const sigIntPromise = new Promise<void>(f => sigintCallback = f);
    const sigintHandler = () => {
      process.off('SIGINT', sigintHandler);
      sigint = true;
      sigintCallback();
    };
    process.on('SIGINT', sigintHandler);
    this._reporter.onBegin(this._loader.config(), suite);
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