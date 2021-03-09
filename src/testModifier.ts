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

import * as types from './types';

export class TestModifier implements types.TestModifier {
  _skipped = false;
  _slow = false;
  _expectedStatus?: types.TestStatus = 'passed';
  _annotations: any[] = [];
  _timeout = 0;

  constructor() {
  }

  setTimeout(timeout: number) {
    this._timeout = timeout;
  }

  slow(arg?: boolean | string, description?: string) {
    const processed = this._interpretCondition(arg, description);
    if (processed.condition) {
      this._slow = true;
      this._timeout *= 3;
      this._annotations.push({
        type: 'slow',
        description: processed.description
      });
    }
  }

  skip(arg?: boolean | string, description?: string) {
    const processed = this._interpretCondition(arg, description);
    if (processed.condition) {
      this._skipped = true;
      this._annotations.push({
        type: 'skip',
        description: processed.description
      });
    }
  }

  fixme(arg?: boolean | string, description?: string) {
    const processed = this._interpretCondition(arg, description);
    if (processed.condition) {
      this._skipped = true;
      this._annotations.push({
        type: 'fixme',
        description: processed.description
      });
    }
  }

  fail(arg?: boolean | string, description?: string) {
    const processed = this._interpretCondition(arg, description);
    if (processed.condition) {
      this._expectedStatus = 'failed';
      this._annotations.push({
        type: 'fail',
        description: processed.description
      });
    }
  }

  private _interpretCondition(arg?: boolean | string, description?: string): { condition: boolean, description?: string } {
    if (arg === undefined && description === undefined)
      return { condition: true };
    if (typeof arg === 'string')
      return { condition: true, description: arg };
    return { condition: !!arg, description };
  }
}
