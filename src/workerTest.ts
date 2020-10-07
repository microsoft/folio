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

import { Spec, Suite } from './test';

export class WorkerSpec extends Spec {
  _id: string;
}

export class WorkerSuite extends Suite {
  _hooks: { type: string, fn: Function } [] = [];

  _assignIds(parametersString: string) {
    this.findSpec((test: WorkerSpec) => {
      test._id = `${test._ordinal}@${this.file}::[${parametersString}]`;
    });
  }

  _addHook(type: string, fn: any) {
    this._hooks.push({ type, fn });
  }
}
