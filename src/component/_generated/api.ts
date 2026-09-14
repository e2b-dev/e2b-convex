/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as e2b_client from "../e2b/client.js";
import type * as e2b_errors from "../e2b/errors.js";
import type * as e2b_index from "../e2b/index.js";
import type * as e2b_protocol from "../e2b/protocol.js";
import type * as e2b_types from "../e2b/types.js";
import type * as exec from "../exec.js";
import type * as identity from "../identity.js";
import type * as lifecycle from "../lifecycle.js";
import type * as output from "../output.js";
import type * as paths from "../paths.js";
import type * as validators from "../validators.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import { anyApi, componentsGeneric } from "convex/server";

const fullApi: ApiFromModules<{
  "e2b/client": typeof e2b_client;
  "e2b/errors": typeof e2b_errors;
  "e2b/index": typeof e2b_index;
  "e2b/protocol": typeof e2b_protocol;
  "e2b/types": typeof e2b_types;
  exec: typeof exec;
  identity: typeof identity;
  lifecycle: typeof lifecycle;
  output: typeof output;
  paths: typeof paths;
  validators: typeof validators;
}> = anyApi as any;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
> = anyApi as any;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
> = anyApi as any;

export const components = componentsGeneric() as unknown as {};
