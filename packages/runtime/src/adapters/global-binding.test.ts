import { MockHostAdapter } from "@openmini/conformance";
import { afterEach, describe, expect, it } from "vitest";
import {
  connectGlobalRuntime,
  mini,
  resetGlobalRuntime,
} from "./global-binding.js";

const G = globalThis as unknown as Record<string, unknown>;

function bindMockHost(permissions: string[]) {
  const session = new MockHostAdapter().openSession({
    permissions,
    allowedDomains: [],
  });
  session.onMessage((raw) => {
    (G["__OPENMINI_ONMESSAGE__"] as ((raw: string) => void) | undefined)?.(raw);
  });
  G["__OPENMINI_HOST__"] = { postMessage: (raw: string) => session.send(raw) };
  G["__OPENMINI_BOOT__"] = { appId: "com.example.t", appVersion: "1.0.0" };
  return session;
}

afterEach(() => {
  resetGlobalRuntime();
  delete G["__OPENMINI_HOST__"];
  delete G["__OPENMINI_ONMESSAGE__"];
  delete G["__OPENMINI_BOOT__"];
});

describe("global binding singleton", () => {
  it("importing mini never throws; first use without a binding rejects helpfully", async () => {
    await expect(mini.storage.get("k")).rejects.toMatchObject({
      name: "BridgeError",
      message: expect.stringContaining("__OPENMINI_HOST__") as string,
    });
  });

  it("mini.* works over the global binding", async () => {
    bindMockHost(["storage"]);
    await mini.storage.set("k", "v");
    await expect(mini.storage.get("k")).resolves.toBe("v");
  });

  it("boot context reaches onLaunch; connect is idempotent", async () => {
    bindMockHost([]);
    expect(connectGlobalRuntime()).toBe(connectGlobalRuntime());
    const launched = new Promise((resolve) => mini.lifecycle.onLaunch(resolve));
    await expect(launched).resolves.toMatchObject({ appId: "com.example.t" });
  });
});
