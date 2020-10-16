/**
 * Copyright Microsoft Corporation. All rights reserved.
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

import { Parameters, TestError, TestStatus } from './ipc';
export { Parameters, TestStatus, TestError } from './ipc';
import type { FolioImpl } from './spec';
import { errorWithCallLocation } from './util';

class Base {
  title: string;
  file: string;
  location: string;
  parent?: Suite;

  _only = false;
  _ordinal: number;
  _folio: FolioImpl;

  constructor(folio: FolioImpl, title: string, parent?: Suite) {
    this._folio = folio;
    this.title = title;
    this.parent = parent;
    // Root suite has default fixtures that do not match all others.
    if (parent && parent.parent && parent._folio !== folio)
      throw errorWithCallLocation(`Mixing different fixture sets in the same suite.\nAre you using it and describe from different fixture files?`);
  }

  titlePath(): string[] {
    if (!this.parent)
      return [];
    if (!this.title)
      return this.parent.titlePath();
    return [...this.parent.titlePath(), this.title];
  }

  fullTitle(): string {
    return this.titlePath().join(' ');
  }
}

export class Spec extends Base {
  fn: Function;
  tests: Test[] = [];

  constructor(fixtures: FolioImpl, title: string, fn: Function, suite: Suite) {
    super(fixtures, title, suite);
    this.fn = fn;
    suite._addSpec(this);
  }

  ok(): boolean {
    return !this.tests.find(r => !r.ok());
  }
}

export class Suite extends Base {
  suites: Suite[] = [];
  specs: Spec[] = [];
  _entries: (Suite | Spec)[] = [];
  total = 0;

  constructor(fixtures: FolioImpl, title: string, parent?: Suite) {
    super(fixtures, title, parent);
    if (parent)
      parent._addSuite(this);
  }

  _addSpec(spec: Spec) {
    spec.parent = this;
    this.specs.push(spec);
    this._entries.push(spec);
  }

  _addSuite(suite: Suite) {
    suite.parent = this;
    this.suites.push(suite);
    this._entries.push(suite);
  }

  findTest(fn: (test: Test) => boolean | void): boolean {
    for (const suite of this.suites) {
      if (suite.findTest(fn))
        return true;
    }
    for (const spec of this.specs) {
      for (const test of spec.tests) {
        if (fn(test))
          return true;
      }
    }
    return false;
  }

  findSpec(fn: (spec: Spec) => boolean | void): boolean {
    for (const suite of this.suites) {
      if (suite.findSpec(fn))
        return true;
    }
    for (const spec of this.specs) {
      if (fn(spec))
        return true;
    }
    return false;
  }

  findSuite(fn: (suite: Suite) => boolean | void): boolean {
    if (fn(this))
      return true;
    for (const suite of this.suites) {
      if (suite.findSuite(fn))
        return true;
    }
    return false;
  }

  _allSpecs(): Spec[] {
    const result: Spec[] = [];
    this.findSpec(test => { result.push(test); });
    return result;
  }

  _renumber() {
    // All tests are identified with their ordinals.
    let ordinal = 0;
    this.findSpec((test: Spec) => {
      test._ordinal = ordinal++;
    });
  }

  _countTotal() {
    this.total = 0;
    for (const suite of this.suites) {
      suite._countTotal();
      this.total += suite.total;
    }
    for (const spec of this.specs)
      this.total += spec.tests.length;
  }

  _hasOnly(): boolean {
    if (this._only)
      return true;
    if (this.suites.find(suite => suite._hasOnly()))
      return true;
    if (this.specs.find(spec => spec._only))
      return true;
  }
}

export class Test {
  spec: Spec;
  parameters: Parameters;
  results: TestResult[] = [];

  skipped = false;
  flaky = false;
  slow = false;
  expectedStatus: TestStatus = 'passed';
  timeout = 0;
  annotations: any[] = [];

  constructor(spec: Spec) {
    this.spec = spec;
  }

  status(): 'skipped' | 'expected' | 'unexpected' | 'expected-flaky' | 'unexpected-flaky' {
    if (this.skipped)
      return 'skipped';
    // List mode bail out.
    if (!this.results.length)
      return 'skipped';
    if (this.results.length === 1 && this.expectedStatus === this.results[0].status)
      return 'expected';
    let hasPassedResults = false;
    for (const result of this.results) {
      // Missing status is Ok when running in shards mode.
      if (!result.status)
        return 'skipped';
      if (result.status === this.expectedStatus)
        hasPassedResults = true;
    }
    if (hasPassedResults)
      return this.flaky ? 'expected-flaky' : 'unexpected-flaky';
    return 'unexpected';
  }

  ok(): boolean {
    const status = this.status();
    return status === 'expected' || status === 'expected-flaky' || status === 'skipped';
  }
}

export type TestResult = {
  retry: number;
  workerIndex: number,
  duration: number;
  status?: TestStatus;
  error?: TestError;
  stdout: (string | Buffer)[];
  stderr: (string | Buffer)[];
  data: any;
};
