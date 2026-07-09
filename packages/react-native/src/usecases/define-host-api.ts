/**
 * Typed, schema-validated registration for host-defined APIs (bridge-protocol
 * §5.1). `defineHostApi` pairs a handler with Zod schemas: the request is
 * validated on EVERY call (mismatch reaches the mini-app as INVALID_PAYLOAD),
 * the response only in dev builds (a host bug, surfaced as HOST_ERROR, with
 * zero production overhead). Plain `Record<name, handler>` registration keeps
 * working — this layer normalizes both to the same thing.
 *
 * Shadowing built-ins is structurally impossible: these names are always
 * called as `mini.host.invoke(name)` → `host.<name>` on the wire.
 */
import { HOST_NAME_PATTERN } from "@openmini/runtime";
import type { z } from "zod";
import { HostApiError } from "../domain/host-errors.js";
import { parseWith } from "../domain/payloads.js";
import type { HostApiHandler } from "./bridge-host.js";

declare const __DEV__: boolean | undefined;

export interface HostApiDefinition<Req = unknown, Res = unknown> {
  /** Bare name — mini-apps call it as `mini.host.invoke("<name>")` and must declare the `host:<name>` permission. */
  name: string;
  /** Validated on every call; mismatch → INVALID_PAYLOAD to the mini-app. */
  request?: z.ZodType<Req>;
  /** Contract for what the handler returns; checked in dev builds only. */
  response?: z.ZodType<Res>;
  handler: (payload: Req) => Res | Promise<Res>;
}

/** Identity with inference: types the handler's payload from the request schema. */
export function defineHostApi<Req = unknown, Res = unknown>(
  definition: HostApiDefinition<Req, Res>,
): HostApiDefinition<Req, Res> {
  return definition;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- variance: element type must accept any concrete Req/Res
export type AnyHostApiDefinition = HostApiDefinition<any, any>;

/** Either registration style, accepted by createBridgeHost / MiniAppProvider. */
export type CustomApis =
  Record<string, HostApiHandler> | AnyHostApiDefinition[];

const IS_DEV = typeof __DEV__ !== "undefined" && __DEV__ === true;

export function normalizeCustomApis(
  apis: CustomApis | undefined,
  devChecks: boolean = IS_DEV,
): Record<string, HostApiHandler> {
  if (apis === undefined) return {};
  if (!Array.isArray(apis)) return apis;
  const handlers: Record<string, HostApiHandler> = {};
  for (const definition of apis) {
    if (!HOST_NAME_PATTERN.test(definition.name)) {
      throw new Error(
        `invalid host API name "${definition.name}" (expected ${String(HOST_NAME_PATTERN)})`,
      );
    }
    if (definition.name in handlers) {
      throw new Error(`duplicate host API "${definition.name}"`);
    }
    handlers[definition.name] = wrap(definition, devChecks);
  }
  return handlers;
}

function wrap(
  definition: AnyHostApiDefinition,
  devChecks: boolean,
): HostApiHandler {
  return async (payload) => {
    const input =
      definition.request !== undefined
        ? parseWith(definition.request, payload)
        : payload;
    const result: unknown = await definition.handler(input);
    if (devChecks && definition.response !== undefined) {
      const parsed = definition.response.safeParse(result);
      if (!parsed.success) {
        throw new HostApiError(
          "HOST_ERROR",
          `host api "${definition.name}" returned a response violating its own schema: ${parsed.error.issues
            .map((i) => `${i.path.join(".") || "response"}: ${i.message}`)
            .join("; ")}`,
        );
      }
    }
    return result ?? null;
  };
}
