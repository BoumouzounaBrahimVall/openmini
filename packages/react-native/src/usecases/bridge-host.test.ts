/**
 * The RN bridge host must pass the SAME golden suite as every other host
 * (conformance/README: GET /echo -> 200 {"ok":true}, anything else -> 404).
 * Adapters here are in-memory; the playground driver runs the identical
 * suite on-device with the real ones (AsyncStorage, Toast, AppState).
 */
import { createServer, type Server } from "node:http";
import {
  runConformance,
  type ConformanceAdapter,
  type SessionManifest,
} from "@openmini/conformance";
import { BRIDGE_VERSION, type SystemInfo } from "@openmini/runtime";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { KvStorage } from "../ports/kv-storage.js";
import { createBridgeHost, type BridgeHostAdapters } from "./bridge-host.js";

let server: Server;
let allowedOrigin: string;
let sessionCounter = 0;

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === "/echo") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end('{"ok":true}');
      return;
    }
    res.writeHead(404);
    res.end("");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string")
    throw new Error("no port");
  allowedOrigin = `http://127.0.0.1:${address.port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

function memoryKv(store = new Map<string, string>()): KvStorage {
  return {
    get: async (key) => store.get(key) ?? null,
    set: async (key, value) => {
      store.set(key, value);
    },
    remove: async (key) => {
      store.delete(key);
    },
  };
}

const FAKE_INFO: SystemInfo = {
  platform: "android",
  osVersion: "35",
  hostSdkVersion: "0.0.0",
  bridgeVersion: BRIDGE_VERSION,
  locale: "en-US",
  theme: "light",
  screen: { width: 400, height: 800, scale: 2 },
  safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
};

function testAdapters(overrides: Partial<BridgeHostAdapters> = {}) {
  return {
    storage: memoryKv(),
    showToast: () => {},
    systemInfo: () => FAKE_INFO,
    close: () => {},
    ...overrides,
  } satisfies BridgeHostAdapters;
}

function rnHostAdapter(): ConformanceAdapter {
  return {
    name: "react-native-host",
    openSession(manifest: SessionManifest) {
      const host = createBridgeHost({
        appId: `conf-${++sessionCounter}`, // fresh storage namespace per session
        manifest,
        adapters: testAdapters(),
        customApis: { conformanceEcho: (payload) => payload ?? null },
      });
      return {
        send: (raw: string) => host.handleMessage(raw),
        onMessage: (cb: (raw: string) => void) => host.onOutbound(cb),
        triggerEvent: (event: string) => host.emitEvent(event),
        capabilities: ["customApis"],
        close: () => {},
      };
    },
  };
}

function call(api: string, payload: unknown, id = "t1"): string {
  return JSON.stringify({ v: 1, type: "bridge.call", id, api, payload });
}

async function settled(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
}

describe("react-native bridge host conformance", () => {
  it("passes the full golden suite, nothing skipped", async () => {
    const report = await runConformance(rnHostAdapter(), {
      placeholders: {
        ALLOWED_ORIGIN: allowedOrigin,
        BLOCKED_ORIGIN: "https://blocked.test",
      },
    });
    expect(report.failures).toEqual([]);
    expect(report.failed).toBe(0);
    expect(report.skipped).toBe(0);
    expect(report.passed).toBeGreaterThanOrEqual(24);
  });
});

describe("react-native bridge host behavior", () => {
  it("namespaces storage by appId over a SHARED backing store", async () => {
    const store = new Map<string, string>();
    const make = (appId: string) => {
      const host = createBridgeHost({
        appId,
        manifest: { permissions: ["storage"], allowedDomains: [] },
        adapters: testAdapters({ storage: memoryKv(store) }),
      });
      const replies: string[] = [];
      host.onOutbound((raw) => replies.push(raw));
      return { host, replies };
    };
    const a = make("app-a");
    const b = make("app-b");
    a.host.handleMessage(call("storage.set", { key: "k", value: "va" }, "1"));
    await settled();
    b.host.handleMessage(call("storage.get", { key: "k" }, "2"));
    await settled();
    const last = JSON.parse(b.replies.at(-1) ?? "{}") as {
      result?: { value: string | null };
    };
    expect(last.result?.value).toBeNull();
    // and the physical key carries the namespace
    expect([...store.keys()]).toEqual(["openmini:app-a:k"]);
  });

  it("defaults toast duration to 3000ms and forwards durationMs", async () => {
    const showToast = vi.fn();
    const host = createBridgeHost({
      appId: "toast-app",
      manifest: { permissions: ["toast"], allowedDomains: [] },
      adapters: testAdapters({ showToast }),
    });
    host.onOutbound(() => {});
    host.handleMessage(call("ui.showToast", { message: "hi" }, "1"));
    host.handleMessage(
      call("ui.showToast", { message: "yo", durationMs: 1500 }, "2"),
    );
    await settled();
    expect(showToast).toHaveBeenNthCalledWith(1, "hi", 3000);
    expect(showToast).toHaveBeenNthCalledWith(2, "yo", 1500);
  });

  it("navigation.close invokes the host close adapter", async () => {
    const close = vi.fn();
    const host = createBridgeHost({
      appId: "close-app",
      manifest: { permissions: [], allowedDomains: [] },
      adapters: testAdapters({ close }),
    });
    host.onOutbound(() => {});
    host.handleMessage(call("navigation.close", {}));
    await settled();
    expect(close).toHaveBeenCalledOnce();
  });

  it("destroy emits app.destroy exactly once and stops routing", async () => {
    const host = createBridgeHost({
      appId: "d-app",
      manifest: { permissions: [], allowedDomains: [] },
      adapters: testAdapters(),
    });
    const out: string[] = [];
    host.onOutbound((raw) => out.push(raw));
    host.destroy();
    host.destroy();
    host.handleMessage(call("system.getInfo", {}));
    await settled();
    const destroys = out.filter(
      (raw) => (JSON.parse(raw) as { event?: string }).event === "app.destroy",
    );
    expect(destroys).toHaveLength(1);
    expect(out).toHaveLength(1); // no bridge.result after teardown
  });

  it("stamps every outbound envelope with the bridge version", async () => {
    const host = createBridgeHost({
      appId: "v-app",
      manifest: { permissions: [], allowedDomains: [] },
      adapters: testAdapters(),
    });
    const out: string[] = [];
    host.onOutbound((raw) => out.push(raw));
    host.emitEvent("app.show");
    host.handleMessage(call("system.getInfo", {}));
    await settled();
    for (const raw of out) {
      expect((JSON.parse(raw) as { v: number }).v).toBe(BRIDGE_VERSION);
    }
  });
});
