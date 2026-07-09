/**
 * The JS global binding contract (specs/webview-serving.md): every host —
 * the `mini dev` server, the native WebView bindings, tests —
 * provides these globals BEFORE app code runs:
 *
 *   __OPENMINI_HOST__      { postMessage(raw) }  mini-app -> host
 *   __OPENMINI_ONMESSAGE__ assignable callback   host -> mini-app
 *                          (host must buffer until it is assigned)
 *   __OPENMINI_BOOT__      BootContext
 *
 * This lets mini-app code simply `import { mini } from "@openmini/runtime"`.
 */
import type { Mini } from "../api/mini.js";
import { BridgeError } from "../domain/errors.js";
import type { BootContext, Transport } from "../ports/transport.js";
import { createMiniRuntime, type MiniRuntime } from "../create-runtime.js";

interface OpenMiniHostGlobal {
  postMessage(raw: string): void;
}

function globals(): Record<string, unknown> {
  return globalThis as unknown as Record<string, unknown>;
}

let runtime: MiniRuntime | undefined;

/** Connects to the host binding globals (idempotent). */
export function connectGlobalRuntime(options?: {
  defaultTimeoutMs?: number;
}): MiniRuntime {
  if (runtime) return runtime;
  const host = globals()["__OPENMINI_HOST__"] as OpenMiniHostGlobal | undefined;
  if (!host || typeof host.postMessage !== "function") {
    throw new BridgeError(
      "HOST_ERROR",
      "no OpenMini host binding found (__OPENMINI_HOST__) — run inside a host app or `mini dev`",
    );
  }
  const transport: Transport = {
    send: (raw) => host.postMessage(raw),
    onMessage: (cb) => {
      globals()["__OPENMINI_ONMESSAGE__"] = cb;
    },
  };
  runtime = createMiniRuntime({
    transport,
    bootContext: globals()["__OPENMINI_BOOT__"] as BootContext | undefined,
    ...options,
  });
  return runtime;
}

/** Test seam: forget the cached runtime (e.g. between jsdom tests). */
export function resetGlobalRuntime(): void {
  runtime = undefined;
}

const m = (): Mini => connectGlobalRuntime().mini;

/**
 * Lazy singleton facade — what mini-app developers import. Connects to the
 * host binding on first use, so importing it never throws at module load.
 */
export const mini: Mini = {
  storage: {
    get: async (key) => m().storage.get(key),
    set: async (key, value) => m().storage.set(key, value),
    remove: async (key) => m().storage.remove(key),
  },
  ui: {
    showToast: async (options) => m().ui.showToast(options),
  },
  system: {
    getInfo: async () => m().system.getInfo(),
  },
  navigation: {
    close: async () => m().navigation.close(),
  },
  request: async (options) => m().request(options),
  host: {
    // invoke rejects on a missing binding; on/lifecycle throw synchronously
    // (they return an Unsubscribe and cannot reject).
    invoke: async (name, payload) => m().host.invoke(name, payload),
    on: (name, cb) => m().host.on(name, cb),
  },
  lifecycle: {
    onLaunch: (cb) => m().lifecycle.onLaunch(cb),
    onShow: (cb) => m().lifecycle.onShow(cb),
    onHide: (cb) => m().lifecycle.onHide(cb),
    onDestroy: (cb) => m().lifecycle.onDestroy(cb),
  },
};
