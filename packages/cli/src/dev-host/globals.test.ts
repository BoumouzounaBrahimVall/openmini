// @vitest-environment jsdom
/**
 * The full dev loop the vite plugin wires: dev host <- global binding -> the
 * runtime `mini` singleton, including buffering of events emitted before the
 * runtime connects.
 */
import { mini, resetGlobalRuntime } from "@openmini/runtime";
import { afterEach, describe, expect, it } from "vitest";
import { createDevHost } from "./browser-host.js";
import { wireDevGlobals } from "./globals.js";

const G = globalThis as unknown as Record<string, unknown>;

afterEach(() => {
  resetGlobalRuntime();
  delete G["__OPENMINI_HOST__"];
  delete G["__OPENMINI_ONMESSAGE__"];
  delete G["__OPENMINI_BOOT__"];
});

describe("dev globals wiring (what `mini dev` injects)", () => {
  it("mini singleton round-trips storage and toast through the dev host", async () => {
    const host = createDevHost({
      appId: "dev-loop",
      manifest: { permissions: ["storage", "toast"], allowedDomains: [] },
    });
    wireDevGlobals(host, { appId: "dev-loop", appVersion: "0.1.0" });
    await mini.storage.set("k", "v");
    await expect(mini.storage.get("k")).resolves.toBe("v");
    await mini.ui.showToast({ message: "from dev loop" });
    expect(document.querySelector("[data-openmini-toast]")?.textContent).toBe(
      "from dev loop",
    );
  });

  it("app.show emitted before the runtime connects is buffered, then delivered", async () => {
    const host = createDevHost({
      appId: "buffered",
      manifest: { permissions: [], allowedDomains: [] },
    });
    wireDevGlobals(host, { appId: "buffered", appVersion: "0.1.0" });
    // wireDevGlobals schedules app.show on a macrotask; wait for it to be
    // emitted while NO runtime is connected yet.
    await new Promise((r) => setTimeout(r, 5));
    const shown = new Promise<void>((resolve) =>
      mini.lifecycle.onShow(resolve),
    ); // connects now
    await expect(shown).resolves.toBeUndefined();
    const boot = await new Promise((resolve) =>
      mini.lifecycle.onLaunch(resolve),
    );
    expect(boot).toMatchObject({ appId: "buffered", appVersion: "0.1.0" });
  });
});
