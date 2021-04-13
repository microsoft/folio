/**
 * Copyright (c) Facebook, Inc. and its affiliates. All Rights Reserved.
 * Modifications copyright (c) Microsoft Corporation.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type expect from 'expect';

export declare type AsymmetricMatcher = Record<string, any>;

export declare type Expect = {
  <T = unknown>(actual: T): folio.Matchers<T>;
  not: {
    [id: string]: AsymmetricMatcher;
  };
};

declare global {
  export namespace folio {
    export interface Matchers<R> extends expect.Matchers<R> {
      /**
       * If you know how to test something, `.not` lets you test its opposite.
       */
      not: folio.Matchers<R>;
      /**
       * Use resolves to unwrap the value of a fulfilled promise so any other
       * matcher can be chained. If the promise is rejected the assertion fails.
       */
      resolves: folio.Matchers<Promise<R>>;
      /**
      * Unwraps the reason of a rejected promise so any other matcher can be chained.
      * If the promise is fulfilled the assertion fails.
      */
      rejects: folio.Matchers<Promise<R>>;
      /**
       * Match snapshot
       */
      toMatchSnapshot(options?: {
        name?: string,
        threshold?: number
      }): R;
      /**
       * Match snapshot
       */
      toMatchSnapshot(name: string, options?: {
        threshold?: number
      }): R;
    }
  }
}

export { };
