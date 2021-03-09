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
import { TestStatus } from './test';
import { debugLog } from './debug';
import { errorWithCallLocation } from './util';

type Scope = 'test' | 'worker';

type FixtureRegistration = {
  name: string;
  scope: Scope;
  fn: Function;
  auto: boolean;
  isOverride: boolean;  // Note: this is not used.
  deps: string[];
  super?: FixtureRegistration;  // Note: this is not used.
};

export type TestInfo = {
  // Declaration
  title: string;
  file: string;
  line: number;
  column: number;
  fn: Function;

  // Parameters
  options: folio.SuiteOptions;
  variation: folio.SuiteVariation;
  workerIndex: number;
  repeatEachIndex: number;
  retry: number;

  // Modifiers
  expectedStatus: TestStatus;
  timeout: number;

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

let workerIndex: number = 0;
export function setCurrentWorkerIndex(index: number) {
  workerIndex = index;
}
export function currentWorkerIndex() {
  return workerIndex;
}

export let config: Config = {} as any;
export function assignConfig(c: Config) {
  config = Object.assign(config, c);
}

class Fixture {
  pool: FixturePool;
  registration: FixtureRegistration;
  usages: Set<Fixture>;
  value: any;
  _teardownFenceCallback: (value?: unknown) => void;
  _tearDownComplete: Promise<void>;
  _setup = false;
  _teardown = false;

  constructor(pool: FixturePool, registration: FixtureRegistration) {
    this.pool = pool;
    this.registration = registration;
    this.usages = new Set();
    this.value = null;
  }

  async setup() {
    const params = {};
    for (const name of this.registration.deps) {
      const registration = this.pool._resolveDependency(this.registration, name);
      if (!registration)
        throw errorWithCallLocation(`Unknown fixture "${name}"`);
      const dep = await this.pool.setupFixtureForRegistration(registration);
      dep.usages.add(this);
      params[name] = dep.value;
    }

    let setupFenceFulfill: { (): void; (value?: unknown): void; };
    let setupFenceReject: { (arg0: any): any; (reason?: any): void; };
    let called = false;
    const setupFence = new Promise<void>((f, r) => { setupFenceFulfill = f; setupFenceReject = r; });
    const teardownFence = new Promise(f => this._teardownFenceCallback = f);
    debugLog(`setup fixture "${this.registration.name}"`);
    this._tearDownComplete = this.registration.fn(params, async (value: any) => {
      if (called)
        throw errorWithCallLocation(`Cannot provide fixture value for the second time`);
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
        throw errorWithCallLocation(`Fixture "${name}" is defined in both fixture sets.`);
      }
    }
    return result;
  }

  registerFixture(name: string, scope: Scope, fn: Function, auto: boolean) {
    const previous = this.registrations.get(name);
    if (previous) {
      // TODO: report file path of the existing fixture.
      if (previous.scope !== scope)
        throw errorWithCallLocation(`Fixture "${name}" has already been registered as a { scope: '${previous.scope}' } fixture. Use a different name for this ${scope} fixture.`);
      else
        throw errorWithCallLocation(`Fixture "${name}" has already been registered. Use a different name for this fixture.`);
    }

    const deps = fixtureParameterNames(fn);
    const registration: FixtureRegistration = { name, scope, fn, auto, isOverride: false, deps, super: previous };
    this.registrations.set(name, registration);
  }

  overrideFixture(name: string, fn: Function) {
    const previous = this.registrations.get(name);
    if (!previous)
      throw errorWithCallLocation(`Fixture "${name}" has not been registered yet. Use 'init' instead.`);

    const deps = fixtureParameterNames(fn);
    const registration: FixtureRegistration = { name, scope: previous.scope, fn, auto: previous.auto, isOverride: true, deps, super: previous };
    this.registrations.set(name, registration);
  }

  validate() {
    const markers = new Map<FixtureRegistration, VisitMarker>();
    const stack: FixtureRegistration[] = [];
    const visit = (registration: FixtureRegistration) => {
      markers.set(registration, 'visiting');
      stack.push(registration);
      for (const name of registration.deps) {
        const dep = this._resolveDependency(registration, name);
        if (!dep)
          throw errorWithCallLocation(`Fixture "${registration.name}" has unknown parameter "${name}".`);
        if (registration.scope === 'worker' && dep.scope === 'test')
          throw errorWithCallLocation(`Worker fixture "${registration.name}" cannot depend on a test fixture "${name}".`);
        if (!markers.has(dep)) {
          visit(dep);
        } else if (markers.get(dep) === 'visiting') {
          const index = stack.indexOf(dep);
          const names = stack.slice(index, stack.length).map(r => `"${r.name}"`);
          throw errorWithCallLocation(`Fixtures ${names.join(' -> ')} -> "${dep.name}" form a dependency cycle.`);
        }
      }
      markers.set(registration, 'visited');
      stack.pop();
    };
    for (const registration of this.registrations.values())
      visit(registration);
  }

  validateFunction(fn: Function, prefix: string, allowTestFixtures: boolean) {
    const visit = (registration: FixtureRegistration) => {
      for (const name of registration.deps)
        visit(this._resolveDependency(registration, name)!);
    };
    for (const name of fixtureParameterNames(fn)) {
      const registration = this.registrations.get(name);
      if (!registration)
        throw errorWithCallLocation(`${prefix} has unknown parameter "${name}".`);
      if (!allowTestFixtures && registration.scope === 'test')
        throw errorWithCallLocation(`${prefix} cannot depend on a test fixture "${name}".`);
      visit(registration);
    }
    for (const registration of this.registrations.values()) {
      if (registration.auto) {
        if (!allowTestFixtures && registration.scope === 'test')
          throw errorWithCallLocation(`${prefix} cannot depend on a test fixture "${registration.name}".`);
        visit(registration);
      }
    }
  }

  async setupFixture(name: string): Promise<Fixture> {
    const registration = this.registrations.get(name);
    if (!registration)
      throw errorWithCallLocation('Unknown fixture: ' + name);
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
    throw errorWithCallLocation('First argument must use the object destructuring pattern: '  + trimmedParams);
  const signature = trimmedParams.substring(1).trim();
  if (!signature)
    return [];
  return signature.split(',').map((t: string) => t.trim().split(':')[0].trim());
}
