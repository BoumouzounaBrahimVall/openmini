import { describe, expect, it, vi } from "vitest";
import { BridgeError } from "../domain/errors.js";
import type { BridgeClient } from "../usecases/bridge-client.js";
import { buildMini } from "./mini.js";

function fakeClient(result: unknown = null) {
  const call = vi.fn().mockResolvedValue(result);
  const on = vi.fn().mockReturnValue(() => {});
  return { client: { call, on } as unknown as BridgeClient, call, on };
}

describe("mini facade", () => {
  it("storage.get unwraps the { value } envelope", async () => {
    const { client, call } = fakeClient({ value: "v" });
    await expect(buildMini(client).storage.get("k")).resolves.toBe("v");
    expect(call).toHaveBeenCalledWith("storage.get", { key: "k" });
  });

  it("request forwards timeoutMs as the per-call timeout", async () => {
    const { client, call } = fakeClient({ status: 200, headers: {}, body: "" });
    await buildMini(client).request({ url: "https://a.test/x", timeoutMs: 42 });
    expect(call).toHaveBeenCalledWith(
      "network.request",
      expect.objectContaining({ url: "https://a.test/x" }),
      {
        timeoutMs: 42,
      },
    );
  });

  it("host.invoke maps to the host.* namespace and validates the name", async () => {
    const { client, call } = fakeClient({ user: "u1" });
    const mini = buildMini(client);
    await expect(mini.host.invoke("getUser", { id: 1 })).resolves.toEqual({
      user: "u1",
    });
    expect(call).toHaveBeenCalledWith("host.getUser", { id: 1 });
    await expect(mini.host.invoke("bad name")).rejects.toMatchObject({
      name: "BridgeError",
      code: "INVALID_PAYLOAD",
    });
    expect(() => mini.host.on("also.bad", () => {})).toThrow(BridgeError);
  });

  it("host.on subscribes with the host. prefix", () => {
    const { client, on } = fakeClient();
    buildMini(client).host.on("cartUpdated", () => {});
    expect(on).toHaveBeenCalledWith("host.cartUpdated", expect.any(Function));
  });

  it("lifecycle maps to app.* events and onLaunch delivers the boot context", async () => {
    const { client, on } = fakeClient();
    const boot = { appId: "com.example.todo", appVersion: "0.1.0" };
    const mini = buildMini(client, boot);
    const launched = new Promise((resolve) => mini.lifecycle.onLaunch(resolve));
    await expect(launched).resolves.toEqual(boot);
    mini.lifecycle.onShow(() => {});
    mini.lifecycle.onDestroy(() => {});
    expect(on).toHaveBeenCalledWith("app.show", expect.any(Function));
    expect(on).toHaveBeenCalledWith("app.destroy", expect.any(Function));
  });

  it("cancelled onLaunch subscription never fires", async () => {
    const { client } = fakeClient();
    const cb = vi.fn();
    buildMini(client).lifecycle.onLaunch(cb)(); // subscribe + immediately unsubscribe
    await new Promise((r) => setTimeout(r, 0));
    expect(cb).not.toHaveBeenCalled();
  });
});
