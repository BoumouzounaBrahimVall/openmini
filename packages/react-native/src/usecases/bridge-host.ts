/**
 * Host side of the bridge in React Native: envelope handling, permission
 * checks, the host.* passthrough, Zod payload validation (decision #11),
 * and error mapping per specs/bridge-protocol.md. Mirrors the browser dev
 * host's router (packages/cli/src/dev-host/router.ts) — extract to a shared
 * package only when the duplication actually hurts (specs/architecture.md).
 *
 * Pure logic: storage/toast/system/close/fetch are injected ports. Wire
 * `handleMessage` to OpenMiniWebView's onBridgeMessage and `onOutbound` to
 * its postMessage — the native channel just shuttles raw strings.
 */
import {
  BRIDGE_VERSION,
  type BridgeResult,
  type ErrorCode,
  type SystemInfo,
} from "@openmini/runtime";
import { HostApiError } from "../domain/host-errors.js";
import {
  parseWith,
  storageKeyPayload,
  storageSetPayload,
  toastPayload,
} from "../domain/payloads.js";
import type { KvStorage } from "../ports/kv-storage.js";
import { normalizeCustomApis, type CustomApis } from "./define-host-api.js";
import { networkRequest } from "./network-request.js";

export interface HostManifest {
  permissions: string[];
  allowedDomains: string[];
}

export type HostApiHandler = (payload: unknown) => unknown | Promise<unknown>;

export interface BridgeHostAdapters {
  storage: KvStorage;
  showToast(message: string, durationMs: number): void;
  systemInfo(): SystemInfo;
  /** navigation.close — the host decides what closing means (pop the page…). */
  close(): void;
  /** Injectable for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

export interface BridgeHostOptions {
  appId: string;
  manifest: HostManifest;
  adapters: BridgeHostAdapters;
  /**
   * Host-defined APIs (bridge-protocol §5.1): plain handlers keyed by bare
   * name, or schema-validated `defineHostApi` definitions.
   */
  customApis?: CustomApis;
}

export interface BridgeHost {
  /** Mini-app -> host: raw string from the WebView message channel. */
  handleMessage(raw: string): void;
  /** Host -> mini-app delivery; wire to OpenMiniWebView postMessage. */
  onOutbound(cb: (raw: string) => void): void;
  /** Push a host event (e.g. "app.show", "host.cartUpdated") to the mini-app. */
  emitEvent(event: string, payload?: unknown): void;
  /** Emits the final app.destroy (once) and stops all routing. */
  destroy(): void;
}

const HOST_PREFIX = "host.";

interface BuiltinApi {
  /** Manifest permission gating this API; undefined = always allowed. */
  permission?: string;
  handler: HostApiHandler;
}

export function createBridgeHost(options: BridgeHostOptions): BridgeHost {
  const { appId, manifest, adapters } = options;
  const customApis = normalizeCustomApis(options.customApis);
  const namespaced = (key: string) => `openmini:${appId}:${key}`;

  const builtins: Record<string, BuiltinApi> = {
    "storage.get": {
      permission: "storage",
      handler: async (p) => ({
        value: await adapters.storage.get(
          namespaced(parseWith(storageKeyPayload, p).key),
        ),
      }),
    },
    "storage.set": {
      permission: "storage",
      handler: async (p) => {
        const { key, value } = parseWith(storageSetPayload, p);
        await adapters.storage.set(namespaced(key), value);
        return null;
      },
    },
    "storage.remove": {
      permission: "storage",
      handler: async (p) => {
        await adapters.storage.remove(
          namespaced(parseWith(storageKeyPayload, p).key),
        );
        return null;
      },
    },
    "ui.showToast": {
      permission: "toast",
      handler: (p) => {
        const { message, durationMs } = parseWith(toastPayload, p);
        adapters.showToast(message, durationMs ?? 3000);
        return null;
      },
    },
    "system.getInfo": { handler: () => adapters.systemInfo() },
    "navigation.close": {
      handler: () => {
        adapters.close();
        return null;
      },
    },
    "network.request": {
      permission: "network",
      handler: (p) =>
        networkRequest(p, manifest.allowedDomains, adapters.fetchImpl ?? fetch),
    },
  };

  async function route(call: {
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
  }

  let toMiniApp: (raw: string) => void = () => {};
  let destroyed = false;
  const deliver = (message: Record<string, unknown>) =>
    toMiniApp(JSON.stringify({ v: BRIDGE_VERSION, ...message }));

  return {
    handleMessage(raw: string): void {
      if (destroyed) return;
      let msg: unknown;
      try {
        msg = JSON.parse(raw);
      } catch {
        return; // malformed: drop, per spec
      }
      const call = msg as {
        type?: unknown;
        id?: unknown;
        api?: unknown;
        payload?: unknown;
      };
      if (
        call.type !== "bridge.call" ||
        typeof call.id !== "string" ||
        typeof call.api !== "string"
      )
        return;
      void route({ id: call.id, api: call.api, payload: call.payload }).then(
        (result) => {
          if (!destroyed) deliver(result as unknown as Record<string, unknown>);
        },
      );
    },
    onOutbound(cb: (raw: string) => void): void {
      toMiniApp = cb;
    },
    emitEvent(event: string, payload: unknown = {}): void {
      if (destroyed) return;
      deliver({ type: "host.event", event, payload });
    },
    destroy(): void {
      if (destroyed) return;
      deliver({ type: "host.event", event: "app.destroy", payload: {} });
      destroyed = true;
    },
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
