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

import expectLibrary from 'expect';
import { config, currentTestInfo } from '.';
import { compare } from './golden';

export const expect = expectLibrary;

declare module 'expect/build/types' {
  interface Matchers<R> {
    toMatchImage(path: string, options?: { threshold?: number  }): R;
  }
}

function toMatchImage(received: Buffer, name: string, options?: { threshold?: number }) {
  const testInfo = currentTestInfo();
  const { pass, message } = compare(received, name, testInfo.snapshotPath, testInfo.outputPath, config.updateSnapshots, options);
  return { pass, message: () => message };
}
expect.extend({ toMatchImage });
