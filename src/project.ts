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

import type { Env, TestType, FullProject } from './types';
import { Spec, Suite, Test } from './test';
import { DeclaredEnv, TestTypeImpl } from './testType';

type TestTypeData = {
  // Test types that have an environment with beforeAll produce a new worker.
  forkingAncestor: TestTypeImpl,
  hashPrefix: string,

  // Options that are used in beforeAll produce a new worker.
  optionsHash: Map<Suite, string>,
  lastOptionsHash: number,
};

export class ProjectImpl {
  config: FullProject;
  readonly useRootDirForSnapshots: boolean;
  private index: number;
  private defines = new Map<TestType<any, any, any>, Env>();
  private testTypeToData = new Map<TestTypeImpl, TestTypeData>();
  private lastForkingAncestorHash = 0;

  constructor(project: FullProject, index: number, useRootDirForSnapshots: boolean) {
    this.config = project;
    this.index = index;
    this.useRootDirForSnapshots = useRootDirForSnapshots;
    this.defines = new Map();
    for (const { test, env } of Array.isArray(project.define) ? project.define : [project.define])
      this.defines.set(test, env);
  }

  private ensureTestTypeData(testType: TestTypeImpl) {
    if (this.testTypeToData.has(testType))
      return this.testTypeToData.get(testType);

    const envs = this.resolveEnvs(testType);
    const env = envs[envs.length - 1];
    // Fork if we get an environment with worker-level hooks.
    const needsFork = env && (env.beforeAll || env.afterAll);

    if (needsFork || !testType.parent) {
      const data: TestTypeData = {
        forkingAncestor: testType,
        hashPrefix: 'env' + String(this.lastForkingAncestorHash++),
        optionsHash: new Map(),
        lastOptionsHash: 0,
      };
      this.testTypeToData.set(testType, data);
      return data;
    }

    const parentData = this.ensureTestTypeData(testType.parent);
    const data: TestTypeData = {
      forkingAncestor: parentData.forkingAncestor,
      hashPrefix: parentData.hashPrefix,
      optionsHash: new Map(),
      lastOptionsHash: 0,
    };
    this.testTypeToData.set(testType, data);
    return data;
  }

  private findSuiteHash(data: TestTypeData, suite: Suite) {
    if (data.optionsHash.has(suite))
      return data.optionsHash.get(suite);

    const envs = this.resolveEnvs(data.forkingAncestor);
    let hasBeforeAllOptions = false;
    if (suite._options) {
      for (const env of envs) {
        if (env.hasBeforeAllOptions)
          hasBeforeAllOptions = hasBeforeAllOptions || env.hasBeforeAllOptions(suite._options);
      }
    }

    const hash = (!hasBeforeAllOptions && suite.parent)
      ? this.findSuiteHash(data, suite.parent)
      : data.hashPrefix + '-options' + String(data.lastOptionsHash++);
    data.optionsHash.set(suite, hash);
    return hash;
  }

  generateTests(spec: Spec, repeatEachIndex?: number) {
    const data = this.ensureTestTypeData(spec._testType);
    const hash = this.findSuiteHash(data, spec.parent!);
    const min = repeatEachIndex === undefined ? 0 : repeatEachIndex;
    const max = repeatEachIndex === undefined ? this.config.repeatEach - 1 : repeatEachIndex;
    const tests: Test[] = [];
    for (let i = min; i <= max; i++) {
      const test = new Test(spec);
      test.projectName = this.config.name;
      test.retries = this.config.retries;
      test._repeatEachIndex = i;
      test._projectIndex = this.index;
      test._workerHash = `run${this.index}-${hash}-repeat${i}`;
      test._id = `${spec._ordinalInFile}@${spec.file}#run${this.index}-repeat${i}`;
      spec.tests.push(test);
      tests.push(test);
    }
    return tests;
  }

  resolveEnvs(testType: TestTypeImpl): Env[] {
    return testType.envs.map(e => e instanceof DeclaredEnv ? this.defines.get(e.testType.test) || {} : e);
  }
}
