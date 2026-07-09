/**
 * Wires a DevHost to the JS global binding contract that
 * `@openmini/runtime`'s `mini` singleton connects to
 * (see specs/webview-serving.md — native bindings implement the same).
 * Host->app messages are buffered until the runtime assigns
 * __OPENMINI_ONMESSAGE__, then flushed in order.
 */
import type { DevHost } from "./browser-host.js";

export interface DevBoot {
  appId: string;
  appVersion: string;
}

export function wireDevGlobals(host: DevHost, boot: DevBoot): void {
  const g = globalThis as unknown as Record<string, unknown>;
  const queue: string[] = [];
  let sink: ((raw: string) => void) | undefined;
  host.transport.onMessage((raw) => {
    if (sink) sink(raw);
    else queue.push(raw);
  });
  Object.defineProperty(globalThis, "__OPENMINI_ONMESSAGE__", {
    configurable: true,
    get: () => sink,
    set: (fn: ((raw: string) => void) | undefined) => {
      sink = fn;
      // Flush on a microtask: the runtime assigns this DURING connect, before
      // the caller has registered its event listeners in the same turn.
      queueMicrotask(() => {
        while (sink && queue.length > 0) sink(queue.shift() as string);
      });
    },
  });
  g["__OPENMINI_HOST__"] = {
    postMessage: (raw: string) => host.transport.send(raw),
  };
  g["__OPENMINI_BOOT__"] = { ...boot, params: {} };
  // Initial visibility event once the page settles.
  setTimeout(() => host.emitEvent("app.show"), 0);
}
