/**
 * Vertical slice, the CI-runnable part: pack → publish → serve
 * over real HTTP → resolve → verify → cache → READ MANIFEST → BRIDGE HOST,
 * i.e. exactly what <MiniAppView> composes minus React and the WebView —
 * plus the OTA path: publish a newer version after the fact, "latest" picks
 * it up with no host change. The failure-mode matrix (tamper, corrupt,
 * traversal) lives in resolver.test.ts.
 */
import { fsRegistryTarget, packApp, publishPackage } from "@openmini/cli";
import { strToU8 } from "fflate";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fetchHttpClient } from "./adapters/fetch-http.js";
import { nodeFileStore, nodeHasher } from "./adapters/node-stores.js";
import { parseAppManifest } from "./domain/app-manifest.js";
import { createBridgeHost } from "./usecases/bridge-host.js";
import { resolvePackage } from "./usecases/resolve-package.js";

const APP_ID = "com.example.slice";
const registryDir = mkdtempSync(join(tmpdir(), "openmini-slice-reg-"));
const cacheDir = mkdtempSync(join(tmpdir(), "openmini-slice-cache-"));
let server: Server;
let base = "";

function manifest(version: string): string {
  return JSON.stringify({
    manifestVersion: 1,
    id: APP_ID,
    name: "Slice",
    version,
    runtimeVersion: ">=0.0.0",
    permissions: ["storage", "toast"],
    allowedDomains: ["https://allowed.test"],
  });
}

async function publish(version: string): Promise<void> {
  const packed = packApp({
    files: {
      "index.html": strToU8(`<!doctype html><h1>slice ${version}</h1>`),
    },
    manifestSource: manifest(version),
    runtimeVersion: "0.0.0",
  });
  await publishPackage({
    bytes: packed.bytes,
    target: fsRegistryTarget(registryDir),
    now: new Date("2026-07-09T00:00:00Z"),
  });
}

beforeAll(async () => {
  await publish("0.1.0");
  server = createServer((req, res) => {
    const file = join(registryDir, decodeURIComponent(req.url ?? "/"));
    try {
      res.end(readFileSync(file));
    } catch {
      res.statusCode = 404;
      res.end("");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string")
    throw new Error("no port");
  base = `http://127.0.0.1:${address.port}`;
});

afterAll(() => {
  server.close();
  rmSync(registryDir, { recursive: true, force: true });
  rmSync(cacheDir, { recursive: true, force: true });
});

function resolve() {
  return resolvePackage({
    registryUrl: base,
    appId: APP_ID,
    ref: "latest",
    cacheDir,
    http: fetchHttpClient(),
    files: nodeFileStore,
    hasher: nodeHasher,
  });
}

describe("vertical slice: registry → resolved package → bridge host", () => {
  it("composes the full chain the way MiniAppView does", async () => {
    const resolved = await resolve();
    expect(resolved).toMatchObject({ version: "0.1.0", fromCache: false });

    // Read the VERIFIED manifest from the extracted package (not the registry)
    const appManifest = parseAppManifest(
      await nodeFileStore.readText(`${resolved.appDir}/manifest.json`),
      APP_ID,
    );
    expect(appManifest.entry).toBe("index.html");

    // Wire the bridge host from the resolved manifest and drive real calls.
    const store = new Map<string, string>();
    const host = createBridgeHost({
      appId: APP_ID,
      manifest: {
        permissions: appManifest.permissions,
        allowedDomains: appManifest.allowedDomains,
      },
      adapters: {
        storage: {
          get: async (k) => store.get(k) ?? null,
          set: async (k, v) => {
            store.set(k, v);
          },
          remove: async (k) => {
            store.delete(k);
          },
        },
        showToast: () => {},
        systemInfo: () => ({
          platform: "android",
          osVersion: "35",
          hostSdkVersion: "0.0.0",
          bridgeVersion: 1,
          locale: "en-US",
          theme: "light",
          screen: { width: 1, height: 1, scale: 1 },
          safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
        }),
        close: () => {},
      },
    });
    const replies: Record<string, unknown>[] = [];
    host.onOutbound((raw) => replies.push(JSON.parse(raw)));
    const call = (id: string, api: string, payload: unknown) =>
      host.handleMessage(
        JSON.stringify({ v: 1, type: "bridge.call", id, api, payload }),
      );
    call("1", "storage.set", { key: "k", value: "from-slice" });
    call("2", "storage.get", { key: "k" });
    // Permission gate comes from the RESOLVED manifest: network undeclared.
    call("3", "network.request", { url: "https://allowed.test/x" });
    await new Promise((r) => setTimeout(r, 10));

    expect(replies.find((m) => m["id"] === "2")).toMatchObject({
      ok: true,
      result: { value: "from-slice" },
    });
    expect(replies.find((m) => m["id"] === "3")).toMatchObject({
      ok: false,
      error: { code: "PERMISSION_DENIED" },
    });
    // and the storage key is namespaced by the resolved appId
    expect([...store.keys()]).toEqual([`openmini:${APP_ID}:k`]);
  });

  it("OTA: a version published AFTER the first install is picked up by latest", async () => {
    expect((await resolve()).version).toBe("0.1.0"); // cached
    await publish("0.1.1");
    const updated = await resolve();
    expect(updated).toMatchObject({ version: "0.1.1", fromCache: false });
    expect(
      await nodeFileStore.readText(`${updated.appDir}/index.html`),
    ).toContain("slice 0.1.1");
    // previous version remains intact in the content-addressed cache
    expect(
      await nodeFileStore.exists(`${cacheDir}/${APP_ID}/0.1.0/index.html`),
    ).toBe(true);
  });
});
