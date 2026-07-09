/**
 * The client side of the contract: drive `mini.*` against the conformance
 * reference host over a real (in-memory) transport. The suite already proves
 * the mock host implements the spec; this proves the runtime speaks it.
 */
import { MockHostAdapter } from "@openmini/conformance";
import { describe, expect, it } from "vitest";
import { createMiniRuntime } from "./index.js";
import type { Transport } from "./ports/transport.js";

function runtimeAgainstMock(
  permissions: string[],
  allowedDomains: string[] = [],
) {
  const session = new MockHostAdapter().openSession({
    permissions,
    allowedDomains,
  });
  const transport: Transport = {
    send: (raw) => session.send(raw),
    onMessage: (cb) => session.onMessage(cb),
  };
  const { mini } = createMiniRuntime({
    transport,
    bootContext: { appId: "t", appVersion: "0.0.0" },
  });
  return { mini, session };
}

describe("runtime ↔ conformance mock host", () => {
  it("storage round-trips through the real protocol", async () => {
    const { mini } = runtimeAgainstMock(["storage"]);
    await mini.storage.set("k", "v");
    await expect(mini.storage.get("k")).resolves.toBe("v");
    await mini.storage.remove("k");
    await expect(mini.storage.get("k")).resolves.toBeNull();
  });

  it("permission denial surfaces as a typed BridgeError", async () => {
    const { mini } = runtimeAgainstMock([]);
    await expect(mini.storage.get("k")).rejects.toMatchObject({
      name: "BridgeError",
      code: "PERMISSION_DENIED",
    });
  });

  it("undeclared network origin is blocked", async () => {
    const { mini } = runtimeAgainstMock(["network"], []);
    await expect(
      mini.request({ url: "https://blocked.test/echo" }),
    ).rejects.toMatchObject({
      code: "NETWORK_DOMAIN_BLOCKED",
    });
  });

  it("allowed network origin returns HTTP data (non-bridge-error semantics)", async () => {
    const { mini } = runtimeAgainstMock(["network"], ["https://allowed.test"]);
    const response = await mini.request({ url: "https://allowed.test/echo" });
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ ok: true });
  });

  it("system info matches the spec shape", async () => {
    const { mini } = runtimeAgainstMock([]);
    const info = await mini.system.getInfo();
    expect(info.bridgeVersion).toBe(1);
    expect(["ios", "android", "web"]).toContain(info.platform);
  });

  it("custom host API round-trips via mini.host.invoke", async () => {
    const { mini } = runtimeAgainstMock(["host:conformanceEcho"]);
    await expect(
      mini.host.invoke("conformanceEcho", { hello: 1 }),
    ).resolves.toEqual({ hello: 1 });
    await expect(mini.host.invoke("notRegistered")).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
    });
  });

  it("host events drive the lifecycle API", async () => {
    const { mini, session } = runtimeAgainstMock([]);
    const shown = new Promise<void>((resolve) =>
      mini.lifecycle.onShow(resolve),
    );
    session.triggerEvent?.("app.show");
    await expect(shown).resolves.toBeUndefined();
  });
});
