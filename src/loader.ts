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

import { installTransform } from './transform';
import type { Env, FullConfig, Config, TestType, ConfigOverrides, FullProject, Project, ReporterDescription } from './types';
import { errorWithCallLocation, prependErrorMessage } from './util';
import { setCurrentlyLoadingFileSuite } from './globals';
import { Suite } from './test';
import { DeclaredEnv, rootTestType, TestTypeImpl } from './testType';
import { SerializedLoaderData } from './ipc';
import * as path from 'path';

export class Loader {
  private _defaultConfig: FullConfig;
  private _configOverrides: ConfigOverrides;
  private _fullConfig: FullConfig;
  private _config: Config = {};
  private _configFile: string = '';
  private _runLists: RunList[] = [];
  private _fileSuites = new Map<string, Suite>();

  constructor(defaultConfig: FullConfig, configOverrides: ConfigOverrides) {
    this._defaultConfig = defaultConfig;
    this._configOverrides = configOverrides;
    this._fullConfig = { ...this._defaultConfig, ...configOverrides };
  }

  static deserialize(data: SerializedLoaderData): Loader {
    const loader = new Loader(data.defaultConfig, data.overrides);
    if (data.configFile)
      loader.loadConfigFile(data.configFile);
    return loader;
  }

  loadConfigFile(file: string) {
    if (this._configFile)
      throw new Error('Cannot load two config files');
    const revertBabelRequire = installTransform();
    try {
      // TODO: add config validation.
      this._config = require(file);
      if ('default' in this._config)
        this._config = this._config['default'];
      for (const key of ['define', 'options', 'snapshotDir', 'name', 'testDir', 'testIgnore', 'testMatch']) {
        if (('projects' in this._config) && (key in this._config))
          throw new Error(`When using projects, passing "${key}" is not supported`);
      }
      const projects: Project[] = 'projects' in this._config ? this._config.projects : [this._config];
      const configDir = path.dirname(file);

      this._fullConfig.rootDir = configDir;
      this._fullConfig.forbidOnly = takeFirst(this._configOverrides.forbidOnly, this._config.forbidOnly, this._defaultConfig.forbidOnly);
      this._fullConfig.globalSetup = takeFirst(this._config.globalSetup, this._defaultConfig.globalSetup);
      this._fullConfig.globalTeardown = takeFirst(this._config.globalTeardown, this._defaultConfig.globalTeardown);
      this._fullConfig.globalTimeout = takeFirst(this._configOverrides.globalTimeout, this._config.globalTimeout, this._defaultConfig.globalTimeout);
      this._fullConfig.grep = takeFirst(this._configOverrides.grep, this._config.grep, this._defaultConfig.grep);
      this._fullConfig.maxFailures = takeFirst(this._configOverrides.maxFailures, this._config.maxFailures, this._defaultConfig.maxFailures);
      const reporter: ReporterDescription[] | undefined = this._config.reporter === undefined ? undefined :
        (Array.isArray(this._config.reporter) ? this._config.reporter : [this._config.reporter]);
      this._fullConfig.reporter = takeFirst(this._configOverrides.reporter, reporter, this._defaultConfig.reporter);
      this._fullConfig.quiet = takeFirst(this._configOverrides.quiet, this._config.quiet, this._defaultConfig.quiet);
      this._fullConfig.shard = takeFirst(this._configOverrides.shard, this._config.shard, this._defaultConfig.shard);
      this._fullConfig.updateSnapshots = takeFirst(this._configOverrides.updateSnapshots, this._config.updateSnapshots, this._defaultConfig.updateSnapshots);
      this._fullConfig.workers = takeFirst(this._configOverrides.workers, this._config.workers, this._defaultConfig.workers);

      for (const project of projects)
        this._addRunList(project, configDir);
      this._configFile = file;
    } catch (e) {
      prependErrorMessage(e, `Error while reading ${file}:\n`);
      throw e;
    } finally {
      revertBabelRequire();
    }
  }

  loadTestFile(file: string) {
    if (this._fileSuites.has(file))
      return this._fileSuites.get(file)!;
    const revertBabelRequire = installTransform();
    try {
      const suite = new Suite('');
      suite.file = file;
      setCurrentlyLoadingFileSuite(suite);
      require(file);
      this._fileSuites.set(file, suite);
      return suite;
    } catch (e) {
      prependErrorMessage(e, `Error while reading ${file}:\n`);
      throw e;
    } finally {
      revertBabelRequire();
      setCurrentlyLoadingFileSuite(undefined);
    }
  }

  loadGlobalHook(file: string): () => any {
    const revertBabelRequire = installTransform();
    try {
      const hook = require(file);
      if (typeof hook !== 'function')
        throw errorWithCallLocation(`globalSetup and globalTeardown files must export a single function.`);
      return hook;
    } catch (e) {
      prependErrorMessage(e, `Error while reading ${file}:\n`);
      throw e;
    } finally {
      revertBabelRequire();
    }
  }

  fullConfig(): FullConfig {
    return this._fullConfig;
  }

  runLists() {
    return this._runLists;
  }

  fileSuites() {
    return this._fileSuites;
  }

  serialize(): SerializedLoaderData {
    return {
      defaultConfig: this._defaultConfig,
      configFile: this._configFile,
      overrides: this._configOverrides,
    };
  }

  private _addRunList(project: Project, defaultTestDir: string) {
    const fullProject: FullProject = {
      define: project.define || [],
      options: project.options || {},
      outputDir: takeFirst(this._configOverrides.outputDir, project.outputDir, this._config.outputDir, path.resolve(process.cwd(), 'test-results')),
      repeatEach: takeFirst(this._configOverrides.repeatEach, project.repeatEach, this._config.repeatEach, 1),
      retries: takeFirst(this._configOverrides.retries, project.retries, this._config.retries, 0),
      snapshotDir: project.snapshotDir || '__snapshots__',
      name: project.name || '',
      testDir: project.testDir || defaultTestDir,
      testIgnore: project.testIgnore || 'node_modules/**',
      testMatch: project.testMatch || '**/?(*.)+(spec|test).[jt]s',
      timeout: takeFirst(this._configOverrides.timeout, project.timeout, this._config.timeout, 10000),
    };
    this._runLists.push(new RunList(fullProject, this._runLists.length));
  }
}

export class RunList {
  index: number;
  project: FullProject;
  defines = new Map<TestType<any, any, any>, Env>();

  constructor(project: FullProject, index: number) {
    this.project = project;
    this.index = index;
    this.defines = new Map();
    for (const { test, env } of Array.isArray(project.define) ? project.define : [project.define])
      this.defines.set(test, env);
  }

  hashTestTypes() {
    const result = new Map<TestTypeImpl, string>();
    const visit = (t: TestTypeImpl, lastWithForkingEnv: TestTypeImpl) => {
      const envs = this.resolveEnvs(t);
      if (envs.length) {
        const env = envs[envs.length - 1];
        // Fork if we get an environment with worker-level hooks,
        // or if we have a spot for declared environment to be filled during runWith.
        if (!env || env.beforeAll || env.afterAll)
          lastWithForkingEnv = t;
      }
      let envHash = result.get(lastWithForkingEnv);
      if (!envHash) {
        envHash = String(result.size);
        result.set(lastWithForkingEnv, envHash);
      }
      result.set(t, envHash);
      for (const child of t.children)
        visit(child, lastWithForkingEnv);
    };
    visit(rootTestType, rootTestType);
    return result;
  }

  resolveEnvs(testType: TestTypeImpl): Env[] {
    return testType.envs.map(e => e instanceof DeclaredEnv ? this.defines.get(e.testType.test) || {} : e);
  }
}

const takeFirst = <T>(...args: (T | undefined)[]): T => {
  for (const arg of args) {
    if (arg !== undefined)
      return arg;
  }
};
