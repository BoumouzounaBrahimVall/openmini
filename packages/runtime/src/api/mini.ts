import { BridgeError } from "../domain/errors.js";
import { HOST_NAME_PATTERN } from "../domain/protocol.js";
import type { BootContext } from "../ports/transport.js";
import type { BridgeClient } from "../usecases/bridge-client.js";

export interface SystemInfo {
  platform: "ios" | "android" | "web";
  osVersion: string;
  hostSdkVersion: string;
  bridgeVersion: 1;
  locale: string;
  theme: "light" | "dark";
  screen: { width: number; height: number; scale: number };
  safeArea: { top: number; right: number; bottom: number; left: number };
}

export interface ToastOptions {
  message: string;
  durationMs?: number;
}

export interface NetworkRequestOptions {
  url: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}

export interface NetworkResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export type Unsubscribe = () => void;

export interface Mini {
  storage: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    remove(key: string): Promise<void>;
  };
  ui: {
    showToast(options: ToastOptions): Promise<void>;
  };
  system: {
    getInfo(): Promise<SystemInfo>;
  };
  navigation: {
    close(): Promise<void>;
  };
  request(options: NetworkRequestOptions): Promise<NetworkResponse>;
  /**
   * Host-defined APIs and events (bridge-protocol §5.1).
   * Invalid names: `invoke` rejects asynchronously, `on` throws synchronously —
   * both with a BridgeError (code INVALID_PAYLOAD).
   */
  host: {
    invoke<T = unknown>(name: string, payload?: unknown): Promise<T>;
    on(name: string, cb: (payload: unknown) => void): Unsubscribe;
  };
  lifecycle: {
    onLaunch(cb: (context: BootContext | undefined) => void): Unsubscribe;
    onShow(cb: () => void): Unsubscribe;
    onHide(cb: () => void): Unsubscribe;
    onDestroy(cb: () => void): Unsubscribe;
  };
}

function assertHostName(name: string): void {
  if (!HOST_NAME_PATTERN.test(name)) {
    throw new BridgeError(
      "INVALID_PAYLOAD",
      `invalid host API/event name "${name}" (expected ${String(HOST_NAME_PATTERN)})`,
    );
  }
}

export function buildMini(client: BridgeClient, boot?: BootContext): Mini {
  return {
    storage: {
      async get(key) {
        const result = (await client.call("storage.get", { key })) as {
          value: string | null;
        };
        return result.value;
      },
      async set(key, value) {
        await client.call("storage.set", { key, value });
      },
      async remove(key) {
        await client.call("storage.remove", { key });
      },
    },
    ui: {
      async showToast(options) {
        await client.call("ui.showToast", options);
      },
    },
    system: {
      async getInfo() {
        return (await client.call("system.getInfo", {})) as SystemInfo;
      },
    },
    navigation: {
      async close() {
        await client.call("navigation.close", {});
      },
    },
    async request(options) {
      return (await client.call("network.request", options, {
        timeoutMs: options.timeoutMs,
      })) as NetworkResponse;
    },
    host: {
      async invoke(name, payload = {}) {
        assertHostName(name);
        // host.* results are host-defined and intentionally unvalidated here
        // (architecture.md validation table); T is asserted by the caller.
        return (await client.call(`host.${name}`, payload)) as never;
      },
      on(name, cb) {
        assertHostName(name);
        return client.on(`host.${name}`, cb);
      },
    },
    lifecycle: {
      onLaunch(cb) {
        // Launch already happened when the runtime was composed; deliver async.
        let cancelled = false;
        void Promise.resolve().then(() => {
          if (!cancelled) cb(boot);
        });
        return () => {
          cancelled = true;
        };
      },
      onShow: (cb) => client.on("app.show", () => cb()),
      onHide: (cb) => client.on("app.hide", () => cb()),
      onDestroy: (cb) => client.on("app.destroy", () => cb()),
    },
  };
}
