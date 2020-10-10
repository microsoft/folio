/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const { folio } = require('../..');
const { it } = folio;

it('stdio', () => {
  process.stdout.write('stdout text');
  process.stdout.write(Buffer.from('stdout buffer'));
  process.stderr.write('stderr text');
  process.stderr.write(Buffer.from('stderr buffer'));
});
