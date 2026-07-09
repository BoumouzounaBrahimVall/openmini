import { describe, expect, it } from "vitest";
import { createHostRouter, HostApiError } from "./router.js";

const manifest = { permissions: ["storage", "host:echo"], allowedDomains: [] };

describe("host router", () => {
  it("maps a throwing handler to HOST_ERROR", async () => {
    const route = createHostRouter({
      manifest,
      builtins: {
        "storage.get": {
          permission: "storage",
          handler: () => {
            throw new Error("disk on fire");
          },
        },
      },
    });
    const result = await route({ id: "1", api: "storage.get", payload: {} });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "HOST_ERROR", message: "disk on fire" },
    });
  });

  it("passes HostApiError codes through verbatim", async () => {
    const route = createHostRouter({
      manifest,
      builtins: {
        "storage.get": {
          permission: "storage",
          handler: () => {
            throw new HostApiError("INVALID_PAYLOAD", "bad key");
          },
        },
      },
    });
    const result = await route({ id: "1", api: "storage.get", payload: {} });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "INVALID_PAYLOAD" },
    });
  });

  it("async custom api resolves; undefined normalizes to null", async () => {
    const route = createHostRouter({
      manifest,
      builtins: {},
      customApis: { echo: async () => undefined },
    });
    const result = await route({ id: "1", api: "host.echo", payload: {} });
    expect(result).toEqual({
      type: "bridge.result",
      id: "1",
      ok: true,
      result: null,
    });
  });
});
