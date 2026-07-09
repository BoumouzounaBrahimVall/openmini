/**
 * The JS injected into every mini-app page at document start. Implements the
 * global binding contract (specs/webview-serving.md): __OPENMINI_HOST__,
 * buffered __OPENMINI_ONMESSAGE__ (microtask-flushed), __OPENMINI_BOOT__,
 * plus __openminiDeliver — the entry point native uses for host->app.
 * Owned by TS so iOS and Android inject the SAME contract (no copy drift).
 */
import type { BootContext } from "../../domain/boot.js";

export function buildBootstrapScript(
  platform: "ios" | "android",
  boot: BootContext,
): string {
  const post =
    platform === "ios"
      ? "window.webkit.messageHandlers.openmini.postMessage(raw)"
      : "window.OpenMiniNative.postMessage(raw)";
  return `(() => {
  if (window.__OPENMINI_HOST__) return; // idempotent across reloads
  const queue = [];
  let sink;
  Object.defineProperty(window, "__OPENMINI_ONMESSAGE__", {
    configurable: true,
    get: () => sink,
    set: (fn) => {
      sink = fn;
      queueMicrotask(() => { while (sink && queue.length > 0) sink(queue.shift()); });
    },
  });
  window.__openminiDeliver = (raw) => {
    if (sink) sink(raw); else queue.push(raw);
  };
  window.__OPENMINI_HOST__ = { postMessage: (raw) => { ${post}; } };
  window.__OPENMINI_BOOT__ = ${JSON.stringify(boot)};
})();`;
}
