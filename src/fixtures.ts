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
  usages: Set<string>;
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
    for (const name of this.registration.deps) {
      await this.pool.setupFixture(name);
      this.pool.instances.get(name).usages.add(this.registration.name);
    }

    const params = {};
    for (const n of this.registration.deps)
      params[n] = this.pool.instances.get(n).value;
    let setupFenceFulfill: { (): void; (value?: unknown): void; };
    let setupFenceReject: { (arg0: any): any; (reason?: any): void; };
    const setupFence = new Promise((f, r) => { setupFenceFulfill = f; setupFenceReject = r; });
    const teardownFence = new Promise(f => this._teardownFenceCallback = f);
    debugLog(`setup fixture "${this.registration.name}"`);
    this._tearDownComplete = this.registration.fn(params, async (value: any) => {
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
      this.pool.instances.delete(this.registration.name);
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
      debugLog(`teardown fixture "${this.registration.name}"`);
      this._teardownFenceCallback();
      await this._tearDownComplete;
    }
    this.pool.instances.delete(this.registration.name);
  }
}

type VisitMarker = 'visiting' | 'visited';
let lastFixturePoolId = 0;

export class FixturePool {
  id: number;
  parentPool: FixturePool | undefined;
  instances = new Map<string, Fixture>();
  registrations: Map<string, FixtureRegistration>;

  constructor(parentPool: FixturePool | undefined) {
    this.parentPool = parentPool;
    this.id = ++lastFixturePoolId;
    this.registrations = new Map(parentPool ? parentPool.registrations : []);
  }

  union(other: FixturePool): FixturePool {
    const result = new FixturePool(this);
    for (const [name, registration] of other.registrations) {
      const found = this.registrations.get(name);
      if (!found)
        result.registrations.set(name, registration);
      else if (found !== registration)
        throw new Error(`Fixture "${name}" is defined in both fixture sets.`);
    }
    return result;
  }

  registerFixture(name: string, scope: Scope, fn: Function, auto: boolean, isOverride: boolean) {
    const previous = this.registrations.get(name);
    if (!isOverride && previous) {
      if (previous.scope !== scope)
        throw new Error(`Fixture "${name}" has already been registered as a ${previous.scope} fixture. Use a different name for this ${scope} fixture.`);
      else
        throw new Error(`Fixture "${name}" has already been registered. Use ${scope === 'test' ? 'overrideTestFixtures' : 'overrideWorkerFixtures'} to override it in a specific test file.`);
    } else if (isOverride && !previous) {
      throw new Error(`Fixture "${name}" has not been registered yet. Use ${scope === 'test' ? 'defineTestFixtures' : 'defineWorkerFixtures'} instead.`);
    } else if (isOverride && previous && previous.scope !== scope) {
      throw new Error(`Fixture "${name}" is a ${previous.scope} fixture. Use ${previous.scope === 'test' ? 'overrideTestFixtures' : 'overrideWorkerFixtures'} instead.`);
    }

    const deps = fixtureParameterNames(fn);
    const registration: FixtureRegistration = { name, scope, fn, auto, isOverride, deps };
    this.registrations.set(name, registration);
  }

  registerWorkerParameter(parameter: ParameterRegistration) {
    if (parameterRegistrations.has(parameter.name))
      throw new Error(`Parameter "${parameter.name}" has been already registered`);
    parameterRegistrations.set(parameter.name, parameter);
    matrix[parameter.name] = [parameter.defaultValue];
  }

  checkCycles() {
    const markers = new Map<FixtureRegistration, VisitMarker>();
    const stack: FixtureRegistration[] = [];
    const visit = (registration: FixtureRegistration): string | undefined => {
      markers.set(registration, 'visiting');
      stack.push(registration);
      const deps = fixtureParameterNames(registration.fn);
      for (const name of deps) {
        const dep = this.registrations.get(name);
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
    const result: string[] = [];
    const visit = (name: string, prefix: string): string | undefined => {
      const registration = this.registrations.get(name);
      if (!registration)
        return `${prefix} has unknown parameter "${name}".`;
      if (!allowTestFixtures && registration.scope === 'test')
        return `${prefix} cannot depend on a test fixture "${name}".`;
      if (parameterRegistrations.has(name))
        result.push(name);
      for (const dep of registration.deps) {
        const error = visit(dep, `Fixture "${name}"`);
        if (error)
          return error;
      }
    };
    for (const name of fixtureParameterNames(fn)) {
      const error = visit(name, prefix);
      if (error)
        throw new Error(error);
    }
    for (const registration of this.registrations.values()) {
      if (registration.auto) {
        const error = visit(registration.name, `Fixture "${registration.name}"`);
        if (error)
          throw new Error(error);
      }
    }
    return result;
  }

  async setupFixture(name: string): Promise<Fixture> {
    let fixture = this.instances.get(name);
    if (fixture)
      return fixture;

    const registration = this.registrations.get(name);
    if (!registration)
      throw new Error('Unknown fixture: ' + name);
    fixture = new Fixture(this, registration);
    this.instances.set(name, fixture);
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
