import { describe, expect, it } from "vitest";
import { bytesToBase64 } from "./base64.js";
import { buildBootstrapScript } from "./bootstrap.js";

describe("native bootstrap script", () => {
  it("implements the binding contract tokens per platform", () => {
    const script = buildBootstrapScript("ios", {
      appId: "com.example.todo",
      appVersion: "1.0.0",
    });
    for (const token of [
      "__OPENMINI_HOST__",
      "__OPENMINI_ONMESSAGE__",
      "__OPENMINI_BOOT__",
      "__openminiDeliver",
      "queueMicrotask",
      "webkit.messageHandlers.openmini",
      '"appId":"com.example.todo"',
    ]) {
      expect(script).toContain(token);
    }
    expect(
      buildBootstrapScript("android", { appId: "a.b", appVersion: "1" }),
    ).toContain("OpenMiniNative.postMessage");
  });

  it("executes: buffered delivery flushes after sink assignment; upstream posts", async () => {
    const script = buildBootstrapScript("android", {
      appId: "a.b",
      appVersion: "1",
    });
    const posted: string[] = [];
    const win = {
      OpenMiniNative: { postMessage: (raw: string) => posted.push(raw) },
    } as Record<string, unknown> & {
      __openminiDeliver?: (raw: string) => void;
      __OPENMINI_HOST__?: { postMessage: (raw: string) => void };
      __OPENMINI_ONMESSAGE__?: (raw: string) => void;
    };
    new Function("window", "queueMicrotask", script)(win, queueMicrotask);
    win.__openminiDeliver?.("early-1");
    win.__openminiDeliver?.("early-2");
    const seen: string[] = [];
    win.__OPENMINI_ONMESSAGE__ = (raw) => seen.push(raw);
    await Promise.resolve();
    expect(seen).toEqual(["early-1", "early-2"]);
    win.__OPENMINI_HOST__?.postMessage("up");
    expect(posted).toEqual(["up"]);
  });
});

describe("base64", () => {
  it("encodes bytes like Buffer does", () => {
    for (const s of [
      "",
      "a",
      "ab",
      "abc",
      "hello openmini!",
      "with unicode ÿ€",
    ]) {
      const bytes = new TextEncoder().encode(s);
      expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString("base64"));
    }
  });
});
