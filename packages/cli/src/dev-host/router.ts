/**
 * Host-side bridge routing: permission checks, the host.* passthrough, and
 * error mapping per specs/bridge-protocol.md. Pure logic — the browser
 * adapters (storage, toast, fetch) are injected. The RN host
 * implements the same rules; extract to a shared package only when that
 * duplication actually hurts (specs/architecture.md pragmatism clause).
 */
import type { BridgeResult, ErrorCode } from "@openmini/runtime";

export interface HostManifest {
  permissions: string[];
  allowedDomains: string[];
}

/** Thrown by handlers to reach the mini-app as a typed bridge error. */
export class HostApiError extends Error {
  override readonly name = "HostApiError";

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export type HostApiHandler = (payload: unknown) => unknown | Promise<unknown>;

export interface BuiltinApi {
  /** Manifest permission gating this API; undefined = always allowed. */
  permission?: string;
  handler: HostApiHandler;
}

export interface HostRouterOptions {
  manifest: HostManifest;
  builtins: Record<string, BuiltinApi>;
  /** Host-defined APIs (bridge-protocol §5.1), keyed by bare name. */
  customApis?: Record<string, HostApiHandler>;
}

const HOST_PREFIX = "host.";

export function createHostRouter(options: HostRouterOptions) {
  const { manifest, builtins, customApis = {} } = options;

  return async function route(call: {
    id: string;
    api: string;
    payload: unknown;
  }): Promise<BridgeResult> {
    const { id, api, payload } = call;
    try {
      if (api.startsWith(HOST_PREFIX)) {
        // §5.1 fixed order: permission first, then registration.
        const name = api.slice(HOST_PREFIX.length);
        if (!manifest.permissions.includes(`host:${name}`)) {
          return err(
            id,
            "PERMISSION_DENIED",
            `host:${name} permission not declared`,
          );
        }
        const handler = customApis[name];
        if (!handler)
          return err(id, "API_NOT_FOUND", `host api ${name} is not registered`);
        return ok(id, (await handler(payload)) ?? null);
      }
      const builtin = builtins[api];
      if (!builtin)
        return err(id, "API_NOT_FOUND", `${api} is not implemented`);
      if (
        builtin.permission !== undefined &&
        !manifest.permissions.includes(builtin.permission)
      ) {
        return err(
          id,
          "PERMISSION_DENIED",
          `${builtin.permission} permission not declared`,
        );
      }
      return ok(id, (await builtin.handler(payload)) ?? null);
    } catch (cause) {
      if (cause instanceof HostApiError)
        return err(id, cause.code, cause.message, cause.details);
      return err(
        id,
        "HOST_ERROR",
        cause instanceof Error ? cause.message : "host handler failed",
      );
    }
  };
}

function ok(id: string, result: unknown): BridgeResult {
  return { type: "bridge.result", id, ok: true, result };
}

function err(
  id: string,
  code: ErrorCode,
  message: string,
  details?: unknown,
): BridgeResult {
  return {
    type: "bridge.result",
    id,
    ok: false,
    error:
      details === undefined ? { code, message } : { code, message, details },
  };
}
