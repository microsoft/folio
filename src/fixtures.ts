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

import { Config } from './config';
import { TestStatus, Parameters } from './test';
import { debugLog } from './debug';

type Scope = 'test' | 'worker';

type FixtureRegistration = {
  name: string;
  scope: Scope;
  fn: Function;
  auto: boolean;
  isOverride: boolean;
  deps: string[];
  super?: FixtureRegistration;
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
  repeatEachIndex: number;
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

  // Paths
  relativeArtifactsPath: string;
  snapshotPath: (...pathSegments: string[]) => string;
  outputPath: (...pathSegments: string[]) => string;
};

let currentTestInfoValue: TestInfo | null = null;

export function setCurrentTestInfo(testInfo: TestInfo | null) {
  currentTestInfoValue = testInfo;
}

export function currentTestInfo(): TestInfo | null {
  return currentTestInfoValue;
}

export type ParameterRegistration = {
  name: string;
  description: string;
  defaultValue: string | number | boolean;
};
export const parameterRegistrations = new Map<string, ParameterRegistration>();
export let parameters: Parameters = {};
export function assignParameters(params: any) {
  parameters = Object.assign(parameters, params);
}

export const matrix: { [name: string]: any } = {};
export function setParameterValues(name: string, values: any[]) {
  if (!(name in matrix))
    throw new Error(`Unregistered parameter '${name}' was set.`);
  matrix[name] = values;
}

export let config: Config = {} as any;
export function assignConfig(c: Config) {
  config = Object.assign(config, c);
}

class Fixture {
  pool: FixturePool;
  registration: FixtureRegistration;
  usages: Set<Fixture>;
  hasGeneratorValue: boolean;
  value: any;
  _teardownFenceCallback: (value?: unknown) => void;
  _tearDownComplete: Promise<void>;
  _setup = false;
  _teardown = false;

  constructor(pool: FixturePool, registration: FixtureRegistration) {
    this.pool = pool;
    this.registration = registration;
    this.usages = new Set();
    this.hasGeneratorValue = registration.name in parameters;
    this.value = this.hasGeneratorValue ? parameters[registration.name] : null;
    if (this.hasGeneratorValue && this.registration.deps.length)
      throw new Error(`Parameter fixture "${this.registration.name}" should not have dependencies`);
  }

  async setup() {
    if (this.hasGeneratorValue)
      return;
    const params = {};
    for (const name of this.registration.deps) {
      const registration = this.pool._resolveDependency(this.registration, name);
      if (!registration)
        throw new Error(`Unknown fixture "${name}"`);
      const dep = await this.pool.setupFixtureForRegistration(registration);
      dep.usages.add(this);
      params[name] = dep.value;
    }

    let setupFenceFulfill: { (): void; (value?: unknown): void; };
    let setupFenceReject: { (arg0: any): any; (reason?: any): void; };
    let called = false;
    const setupFence = new Promise((f, r) => { setupFenceFulfill = f; setupFenceReject = r; });
    const teardownFence = new Promise(f => this._teardownFenceCallback = f);
    debugLog(`setup fixture "${this.registration.name}"`);
    this._tearDownComplete = this.registration.fn(params, async (value: any) => {
      if (called)
        throw new Error(`Cannot provide fixture value for the second time`);
      called = true;
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
      this.pool.instances.delete(this.registration);
      return;
    }
    if (this._teardown)
      return;
    this._teardown = true;
    for (const fixture of this.usages)
      await fixture.teardown();
    this.usages.clear();
    if (this._setup) {
      debugLog(`teardown fixture "${this.registration.name}"`);
      this._teardownFenceCallback();
      await this._tearDownComplete;
    }
    this.pool.instances.delete(this.registration);
  }
}

type VisitMarker = 'visiting' | 'visited';
let lastFixturePoolId = 0;

export class FixturePool {
  id: number;
  parentPool: FixturePool | undefined;
  instances = new Map<FixtureRegistration, Fixture>();
  registrations: Map<string, FixtureRegistration>;

  constructor(parentPool: FixturePool | undefined) {
    this.parentPool = parentPool;
    this.id = ++lastFixturePoolId;
    this.registrations = new Map(parentPool ? parentPool.registrations : []);
  }

  union(other: FixturePool): FixturePool {
    const containsRegistrationRecursively = (pool: FixturePool, registration: FixtureRegistration): boolean => {
      if (pool.registrations.get(registration.name) === registration)
        return true;
      if (!pool.parentPool)
        return false;
      return containsRegistrationRecursively(pool.parentPool, registration);
    };

    const result = new FixturePool(this);
    for (const [name, otherRegistration] of other.registrations) {
      const thisRegistration = this.registrations.get(name);
      if (!thisRegistration) {
        result.registrations.set(name, otherRegistration);
      } else if (containsRegistrationRecursively(this, otherRegistration)) {
        // |this| contains an override - do nothing.
      } else if (containsRegistrationRecursively(other, thisRegistration)) {
        // |other| contains an override - use it.
        result.registrations.set(name, otherRegistration);
      } else {
        // Both |this| and |other| have a different override - throw.
        throw new Error(`Fixture "${name}" is defined in both fixture sets.`);
      }
    }
    return result;
  }

  registerFixture(name: string, scope: Scope, fn: Function, auto: boolean) {
    const previous = this.registrations.get(name);
    if (previous) {
      if (previous.scope !== scope)
        throw new Error(`Fixture "${name}" has already been registered as a { scope: '${previous.scope}' } fixture. Use a different name for this ${scope} fixture.`);
      else
        throw new Error(`Fixture "${name}" has already been registered. Use 'override' to override it in a specific test file.`);
    }

    const deps = fixtureParameterNames(fn);
    const registration: FixtureRegistration = { name, scope, fn, auto, isOverride: false, deps, super: previous };
    this.registrations.set(name, registration);
  }

  overrideFixture(name: string, fn: Function) {
    const previous = this.registrations.get(name);
    if (!previous)
      throw new Error(`Fixture "${name}" has not been registered yet. Use 'init' instead.`);

    const deps = fixtureParameterNames(fn);
    const registration: FixtureRegistration = { name, scope: previous.scope, fn, auto: previous.auto, isOverride: true, deps, super: previous };
    this.registrations.set(name, registration);
  }

  registerWorkerParameter(parameter: ParameterRegistration) {
    if (parameterRegistrations.has(parameter.name))
      throw new Error(`Parameter "${parameter.name}" has been already registered`);
    parameterRegistrations.set(parameter.name, parameter);
    matrix[parameter.name] = [parameter.defaultValue];
  }

  validate() {
    const markers = new Map<FixtureRegistration, VisitMarker>();
    const stack: FixtureRegistration[] = [];
    const visit = (registration: FixtureRegistration): string | undefined => {
      markers.set(registration, 'visiting');
      stack.push(registration);
      for (const name of registration.deps) {
        const dep = this._resolveDependency(registration, name);
        if (!dep)
          return `Fixture "${registration.name}" has unknown parameter "${name}".`;
        if (registration.scope === 'worker' && dep.scope === 'test')
          return `Worker fixture "${registration.name}" cannot depend on a test fixture "${name}".`;
        if (!markers.has(dep)) {
          const error = visit(dep);
          if (error)
            return error;
        } else if (markers.get(dep) === 'visiting') {
          const index = stack.indexOf(dep);
          const names = stack.slice(index, stack.length).map(r => `"${r.name}"`);
          return `Fixtures ${names.join(' -> ')} -> "${dep.name}" form a dependency cycle.`;
        }
      }
      markers.set(registration, 'visited');
      stack.pop();
    };
    for (const registration of this.registrations.values()) {
      const error = visit(registration);
      if (error)
        throw new Error(error);
    }
  }

  parametersForFunction(fn: Function, prefix: string, allowTestFixtures: boolean): string[] {
    const result = new Set<string>();
    const visit = (registration: FixtureRegistration) => {
      if (parameterRegistrations.has(registration.name))
        result.add(registration.name);
      for (const name of registration.deps)
        visit(this._resolveDependency(registration, name)!);
    };
    for (const name of fixtureParameterNames(fn)) {
      const registration = this.registrations.get(name);
      if (!registration)
        throw new Error(`${prefix} has unknown parameter "${name}".`);
      if (!allowTestFixtures && registration.scope === 'test')
        throw new Error(`${prefix} cannot depend on a test fixture "${name}".`);
      visit(registration);
    }
    for (const registration of this.registrations.values()) {
      if (registration.auto) {
        if (!allowTestFixtures && registration.scope === 'test')
          throw new Error(`${prefix} cannot depend on a test fixture "${registration.name}".`);
        visit(registration);
      }
    }
    return Array.from(result);
  }

  async setupFixture(name: string): Promise<Fixture> {
    const registration = this.registrations.get(name);
    if (!registration)
      throw new Error('Unknown fixture: ' + name);
    return this.setupFixtureForRegistration(registration);
  }

  async setupFixtureForRegistration(registration: FixtureRegistration): Promise<Fixture> {
    let fixture = this.instances.get(registration);
    if (fixture)
      return fixture;

    fixture = new Fixture(this, registration);
    this.instances.set(registration, fixture);
    await fixture.setup();
    return fixture;
  }

  async teardownScope(scope: string) {
    for (const [, fixture] of this.instances) {
      if (fixture.registration.scope === scope)
        await fixture.teardown();
    }
  }

  async resolveParametersAndRunHookOrTest(fn: Function) {
    // Install all automatic fixtures.
    for (const registration of this.registrations.values()) {
      if (registration.auto)
        await this.setupFixtureForRegistration(registration);
    }

    // Install used fixtures.
    const names = fixtureParameterNames(fn);
    const params = {};
    for (const name of names) {
      const fixture = await this.setupFixture(name);
      params[name] = fixture.value;
    }
    return fn(params);
  }

  _resolveDependency(registration: FixtureRegistration, name: string): FixtureRegistration | undefined {
    if (name === registration.name)
      return registration.super;
    return this.registrations.get(name);
  }
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
    throw new Error('First argument must use the object destructuring pattern: '  + trimmedParams);
  const signature = trimmedParams.substring(1).trim();
  if (!signature)
    return [];
  return signature.split(',').map((t: string) => t.trim().split(':')[0].trim());
}
