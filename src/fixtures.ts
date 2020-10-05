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

import crypto from 'crypto';
import { Config } from './config';
import { callerFile } from './util';
import { TestStatus, Parameters } from './test';
import { debugLog } from './debug';

type Scope = 'test' | 'worker';

export type FixtureDefinitionOptions = {
  auto?: boolean;
};

type FixtureRegistration = {
  id: number;
  name: string;
  scope: Scope;
  fn: Function;
  file: string;
  stack: string;
  auto: boolean;
  isOverride: boolean;
};

export type TestInfo = {
  // Declaration
  title: string;
  file: string;
  location: string;
  fn: Function;

  // Parameters
  parameters: Parameters;
  workerIndex: number;
  retry: number;

  // Modifiers
  expectedStatus: TestStatus;
  deadline: number;

  // Results
  duration: number;
  status?: TestStatus;
  error?: any;
  stdout: (string | Buffer)[];
  stderr: (string | Buffer)[];
  data: any;
};

export const registrations = new Map<string, FixtureRegistration>();
const registrationsByFile = new Map<string, FixtureRegistration[]>();
let registrationCount = 0;

export let parameters: any = {};

export type ParameterRegistration = {
  name: string;
  description: string;
  defaultValue: string | number | boolean;
};

export const parameterRegistrations = new Map<string, ParameterRegistration>();

export function assignParameters(params: any) {
  parameters = Object.assign(parameters, params);
}

export const matrix: any = {};

export let config: Config = {} as any;
export function assignConfig(c: Config) {
  config = Object.assign(config, c);
}

class Fixture {
  pool: FixturePool;
  name: string;
  scope: Scope;
  fn: Function;
  deps: string[];
  usages: Set<string>;
  hasGeneratorValue: boolean;
  value: any;
  _teardownFenceCallback: (value?: unknown) => void;
  _tearDownComplete: Promise<void>;
  _setup = false;
  _teardown = false;

  constructor(pool: FixturePool, name: string, scope: Scope, fn: any) {
    this.pool = pool;
    this.name = name;
    this.scope = scope;
    this.fn = fn;
    this.deps = fixtureParameterNames(this.fn);
    this.usages = new Set();
    this.hasGeneratorValue = name in parameters;
    this.value = this.hasGeneratorValue ? parameters[name] : null;
  }

  async setup() {
    if (this.hasGeneratorValue)
      return;
    for (const name of this.deps) {
      await this.pool.setupFixture(name);
      this.pool.instances.get(name).usages.add(this.name);
    }

    const params = {};
    for (const n of this.deps)
      params[n] = this.pool.instances.get(n).value;
    let setupFenceFulfill: { (): void; (value?: unknown): void; };
    let setupFenceReject: { (arg0: any): any; (reason?: any): void; };
    const setupFence = new Promise((f, r) => { setupFenceFulfill = f; setupFenceReject = r; });
    const teardownFence = new Promise(f => this._teardownFenceCallback = f);
    debugLog(`setup fixture "${this.name}"`);
    this._tearDownComplete = this.fn(params, async (value: any) => {
      this.value = value;
      setupFenceFulfill();
      return await teardownFence;
    }).catch((e: any) => {
      if (!this._setup)
        setupFenceReject(e);
      else
        throw e;

    });
    await setupFence;
    this._setup = true;
  }

  async teardown() {
    if (this.hasGeneratorValue) {
      this.pool.instances.delete(this.name);
      return;
    }
    if (this._teardown)
      return;
    this._teardown = true;
    for (const name of this.usages) {
      const fixture = this.pool.instances.get(name);
      if (!fixture)
        continue;
      await fixture.teardown();
    }
    if (this._setup) {
      debugLog(`teardown fixture "${this.name}"`);
      this._teardownFenceCallback();
      await this._tearDownComplete;
    }
    this.pool.instances.delete(this.name);
  }
}

export class FixturePool {
  instances: Map<string, Fixture>;
  constructor() {
    this.instances = new Map();
  }

  async setupFixture(name: string) {
    let fixture = this.instances.get(name);
    if (fixture)
      return fixture;

    if (!registrations.has(name))
      throw new Error('Unknown fixture: ' + name);
    const { scope, fn } = registrations.get(name);
    fixture = new Fixture(this, name, scope, fn);
    this.instances.set(name, fixture);
    await fixture.setup();
    return fixture;
  }

  async teardownScope(scope: string) {
    for (const [, fixture] of this.instances) {
      if (fixture.scope === scope)
        await fixture.teardown();
    }
  }

  async resolveParametersAndRunHookOrTest(fn: Function) {
    // Install all automatic fixtures.
    for (const registration of registrations.values()) {
      if (registration.auto)
        await this.setupFixture(registration.name);
    }

    // Install used fixtures.
    const names = fixtureParameterNames(fn);
    for (const name of names)
      await this.setupFixture(name);
    const params = {};
    for (const n of names)
      params[n] = this.instances.get(n).value;
    return fn(params);
  }
}

export function fixturesForCallback(callback: Function): string[] {
  const names = new Set<string>();
  const visit  = (callback: Function) => {
    for (const name of fixtureParameterNames(callback)) {
      if (name in names)
        continue;
      names.add(name);
      if (!registrations.has(name))
        throw new Error('Using undefined fixture ' + name);

      const { fn } = registrations.get(name);
      visit(fn);
    }
  };

  // Account for automatic fixtures.
  for (const registration of registrations.values()) {
    if (registration.auto) {
      names.add(registration.name);
      visit(registration.fn);
    }
  }

  visit(callback);
  const result = [...names];
  result.sort();
  return result;
}

const signatureSymbol = Symbol('signature');

function fixtureParameterNames(fn: Function): string[] {
  if (!fn[signatureSymbol])
    fn[signatureSymbol] = innerFixtureParameterNames(fn);
  return fn[signatureSymbol];
}

function innerFixtureParameterNames(fn: Function): string[] {
  const text = fn.toString();
  const match = text.match(/(?:async)?(?:\s+function)?[^\(]*\(([^})]*)/);
  if (!match)
    return [];
  const trimmedParams = match[1].trim();
  if (!trimmedParams)
    return [];
  if (trimmedParams && trimmedParams[0] !== '{')
    throw new Error('First argument must use the object destructuring pattern.'  + trimmedParams);
  const signature = trimmedParams.substring(1).trim();
  if (!signature)
    return [];
  return signature.split(',').map((t: string) => t.trim().split(':')[0].trim());
}

function innerRegisterFixture(name: string, scope: Scope, fn: Function, options: FixtureDefinitionOptions, isOverride: boolean) {
  const file = callerFile(innerRegisterFixture, 3);
  const obj = { stack: '' };
  Error.captureStackTrace(obj);
  const stack = obj.stack.substring('Error:\n'.length);
  const registration: FixtureRegistration = { id: registrationCount++, name, scope, fn, file, stack, auto: options.auto, isOverride };
  if (!registrationsByFile.has(file))
    registrationsByFile.set(file, []);
  registrationsByFile.get(file).push(registration);
}

export function registerFixture(name: string, fn: (params: any, runTest: (arg: any) => Promise<void>) => Promise<void>, options: FixtureDefinitionOptions, isOverride: boolean) {
  innerRegisterFixture(name, 'test', fn, options, isOverride);
}

export function registerWorkerFixture(name: string, fn: (params: any, runTest: (arg: any) => Promise<void>) => Promise<void>, options: FixtureDefinitionOptions, isOverride: boolean) {
  innerRegisterFixture(name, 'worker', fn, options, isOverride);
}

export function registerWorkerParameter(parameter: ParameterRegistration) {
  parameterRegistrations.set(parameter.name, parameter);
}

export function setParameterValues(name: string, values: any[]) {
  if (!parameterRegistrations.has(name))
    throw new Error(`Unregistered parameter '${name}' was set.`);
  matrix[name] = values;
}

function topSortRequires(file: string): string[] {
  const visited = new Set<string>();
  const result: string[] = [];
  const visit = (file: string) => {
    file = require.resolve(file);
    if (visited.has(file))
      return;
    visited.add(file);
    const cache = require.cache[file];
    const deps = cache ? cache.children.map((m: { id: any; }) => m.id) : [];
    for (const dep of deps)
      visit(dep);
    result.push(file);
  };
  visit(file);
  return result;
}

function lookupRegistrations(file: string): FixtureRegistration[] {
  const deps = topSortRequires(file);
  const result = [];
  for (const dep of deps) {
    const registrationList = registrationsByFile.get(dep) || [];
    result.push(...registrationList);
  }
  return result;
}

function errorWithStack(stack: string, message: string): Error {
  const e = new Error(message);
  e.stack = 'Error: ' + message + stack;
  return e;
}

type VisitMarker = 'visiting' | 'visited';
export function validateRegistrations(file: string): string {
  // When we are running several tests in the same worker, we should cherry pick
  // registrations specific to each file. That way we erase potential fixtures
  // from previous test files.
  registrations.clear();
  const hash = crypto.createHash('sha1');
  const list = lookupRegistrations(file);

  for (const registration of list) {
    const previous = registrations.get(registration.name);
    if (!registration.isOverride && previous) {
      if (previous.scope !== registration.scope)
        throw errorWithStack(registration.stack, `Fixture "${registration.name}" has already been registered as a ${previous.scope} fixture. Use a different name for this ${registration.scope} fixture.`);
      else
        throw errorWithStack(registration.stack, `Fixture "${registration.name}" has already been registered. Use ${registration.scope === 'test' ? 'overrideTestFixtures' : 'overrideWorkerFixtures'} to override it in a specific test file.`);
    } else if (registration.isOverride && !previous) {
      throw errorWithStack(registration.stack, `Fixture "${registration.name}" has not been registered yet. Use ${registration.scope === 'test' ? 'defineTestFixtures' : 'defineWorkerFixtures'} instead.`);
    } else if (registration.isOverride && previous && previous.scope !== registration.scope) {
      throw errorWithStack(registration.stack, `Fixture "${registration.name}" is a ${previous.scope} fixture. Use ${previous.scope === 'test' ? 'overrideTestFixtures' : 'overrideWorkerFixtures'} instead.`);
    }
    registrations.set(registration.name, registration);
    if (registration.scope === 'worker')
      hash.update('#' + registration.id);
  }

  const markers = new Map<FixtureRegistration, VisitMarker>();
  const stack: FixtureRegistration[] = [];
  const visit = (registration: FixtureRegistration) => {
    markers.set(registration, 'visiting');
    stack.push(registration);
    const deps = fixtureParameterNames(registration.fn);
    for (const name of deps) {
      const dep = registrations.get(name);
      if (!dep)
        throw errorWithStack(registration.stack, `Fixture "${registration.name}" has unknown parameter "${name}".`);
      if (registration.scope === 'worker' && dep.scope === 'test')
        throw errorWithStack(registration.stack, `Worker fixture "${registration.name}" cannot depend on a test fixture "${name}".`);
      if (!markers.has(dep)) {
        visit(dep);
      } else if (markers.get(dep) === 'visiting') {
        const index = stack.indexOf(dep);
        const names = stack.slice(index, stack.length).map(r => `"${r.name}"`);
        throw errorWithStack(registration.stack, `Fixtures ${names.join(' -> ')} -> "${dep.name}" form a dependency cycle.`);
      }
    }
    markers.set(registration, 'visited');
    stack.pop();
  };
  for (const registration of registrations.values())
    visit(registration);
  return hash.digest('hex');
}

export function validateFixturesForFunction(fn: Function, stack: string, fnName: string, allowTestFixtures: boolean) {
  const deps = fixtureParameterNames(fn);
  for (const name of deps) {
    const dep = registrations.get(name);
    if (!dep)
      throw errorWithStack(stack, `${fnName} has unknown parameter "${name}".`);
    if (!allowTestFixtures && dep.scope === 'test')
      throw errorWithStack(stack, `${fnName} cannot depend on a test fixture "${name}".`);
  }
}
