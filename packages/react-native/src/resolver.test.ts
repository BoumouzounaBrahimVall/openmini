/** Resolver test matrix against a real local static server. */
import {
  fsRegistryTarget,
  packApp,
  publishPackage,
  sha256,
} from "@openmini/cli";
import { strToU8, zipSync } from "fflate";
import { createServer, type Server } from "node:http";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fetchHttpClient } from "./adapters/fetch-http.js";
import { nodeFileStore, nodeHasher } from "./adapters/node-stores.js";
import {
  resolvePackage,
  type ResolveOptions,
} from "./usecases/resolve-package.js";

const registryDir = mkdtempSync(join(tmpdir(), "openmini-reg-"));
const cacheDir = mkdtempSync(join(tmpdir(), "openmini-cache-"));
let server: Server;
let base = "";
const hits: Record<string, number> = {};

function makePackage(version: string): Uint8Array {
  return packApp({
    files: {
      "index.html": strToU8(
        `<html><head></head><body>v${version}</body></html>`,
      ),
    },
    manifestSource: JSON.stringify({
      manifestVersion: 1,
      id: "com.example.todo",
      name: "Todo",
      version,
      runtimeVersion: ">=0.0.0",
    }),
    runtimeVersion: "0.1.0",
  }).bytes;
}

function opts(
  ref: string,
  overrides: Partial<ResolveOptions> = {},
): ResolveOptions {
  return {
    registryUrl: base,
    appId: "com.example.todo",
    ref,
    cacheDir,
    http: fetchHttpClient(),
    files: nodeFileStore,
    hasher: nodeHasher,
    ...overrides,
  };
}

beforeAll(async () => {
  const target = fsRegistryTarget(registryDir);
  await publishPackage({
    bytes: makePackage("1.0.0"),
    target,
    now: new Date("2026-07-08T12:00:00Z"),
  });
  await publishPackage({
    bytes: makePackage("1.1.0"),
    target,
    now: new Date("2026-07-08T13:00:00Z"),
  });
  // add a channel + a corrupt-but-hash-consistent entry + a traversal package by hand
  const indexPath = join(registryDir, "com.example.todo/index.json");
  const index = JSON.parse(readFileSync(indexPath, "utf8")) as {
    channels?: Record<string, string>;
    versions: Record<
      string,
      {
        package: string;
        sha256: string;
        size: number;
        runtimeVersion: string;
        publishedAt: string;
      }
    >;
  };
  index.channels = { staging: "1.0.0" };
  const junk = strToU8("this is not a zip");
  writeFileSync(join(registryDir, "com.example.todo/9.9.9-junk"), "");
  index.versions["9.9.9-junk.0"] = {
    package: "9.9.9/app.mpkg",
    sha256: sha256(junk),
    size: junk.byteLength,
    runtimeVersion: "0.1.0",
    publishedAt: "2026-07-08T14:00:00Z",
  };
  const traversal = zipSync({
    "manifest.json": strToU8("{}"),
    "hashes.json": strToU8("{}"),
    "../evil.js": strToU8("x"),
  });
  index.versions["9.9.8-trav.0"] = {
    package: "9.9.8/app.mpkg",
    sha256: sha256(traversal),
    size: traversal.byteLength,
    runtimeVersion: "0.1.0",
    publishedAt: "2026-07-08T14:00:00Z",
  };
  writeFileSync(indexPath, JSON.stringify(index));
  const { mkdirSync } = await import("node:fs");
  mkdirSync(join(registryDir, "com.example.todo/9.9.9"), { recursive: true });
  writeFileSync(join(registryDir, "com.example.todo/9.9.9/app.mpkg"), junk);
  mkdirSync(join(registryDir, "com.example.todo/9.9.8"), { recursive: true });
  writeFileSync(
    join(registryDir, "com.example.todo/9.9.8/app.mpkg"),
    traversal,
  );

  server = createServer((req, res) => {
    const url = decodeURIComponent(req.url ?? "/");
    hits[url] = (hits[url] ?? 0) + 1;
    try {
      res.end(readFileSync(join(registryDir, url)));
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  if (address === null || typeof address === "string")
    throw new Error("no port");
  base = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  rmSync(registryDir, { recursive: true, force: true });
  rmSync(cacheDir, { recursive: true, force: true });
});

const INDEX_URL = "/com.example.todo/index.json";

describe("resolvePackage", () => {
  it("latest: downloads, verifies, extracts into the content-addressed cache", async () => {
    const resolved = await resolvePackage(opts("latest"));
    expect(resolved).toMatchObject({ version: "1.1.0", fromCache: false });
    expect(existsSync(join(resolved.appDir, "index.html"))).toBe(true);
    expect(existsSync(join(resolved.appDir, "manifest.json"))).toBe(true);
    expect(hits[INDEX_URL]).toBe(1);
    expect(hits["/com.example.todo/1.1.0/app.mpkg"]).toBe(1);
  });

  it("pinned + cached: zero network; latest re-checks only the index", async () => {
    const before = { ...hits };
    const pinned = await resolvePackage(opts("1.1.0"));
    expect(pinned.fromCache).toBe(true);
    expect(hits).toEqual(before);
    const again = await resolvePackage(opts("latest"));
    expect(again.fromCache).toBe(true);
    expect(hits[INDEX_URL]).toBe((before[INDEX_URL] ?? 0) + 1);
    expect(hits["/com.example.todo/1.1.0/app.mpkg"]).toBe(1);
  });

  it("resolves channels", async () => {
    const resolved = await resolvePackage(opts("staging"));
    expect(resolved.version).toBe("1.0.0");
  });

  it("hash mismatch: rejected, cache untouched", async () => {
    // tamper 1.0.0 on the server AFTER publishing; the index sha no longer matches
    writeFileSync(
      join(registryDir, "com.example.todo/1.0.0/app.mpkg"),
      "tampered bytes",
    );
    rmSync(join(cacheDir, "com.example.todo/1.0.0"), {
      recursive: true,
      force: true,
    });
    rmSync(join(cacheDir, "com.example.todo/1.0.0.meta.json"), { force: true });
    await expect(resolvePackage(opts("1.0.0"))).rejects.toMatchObject({
      code: "HASH_MISMATCH",
    });
    expect(existsSync(join(cacheDir, "com.example.todo/1.0.0"))).toBe(false);
  });

  it("corrupt archive with a matching sha: BAD_PACKAGE, cache untouched", async () => {
    await expect(resolvePackage(opts("9.9.9-junk.0"))).rejects.toMatchObject({
      code: "BAD_PACKAGE",
    });
    expect(existsSync(join(cacheDir, "com.example.todo/9.9.9-junk.0"))).toBe(
      false,
    );
  });

  it("path traversal in the archive: BAD_PACKAGE", async () => {
    await expect(resolvePackage(opts("9.9.8-trav.0"))).rejects.toMatchObject({
      code: "BAD_PACKAGE",
    });
  });

  it("typed errors: unknown ref, unknown app, incompatible runtime (no download)", async () => {
    await expect(resolvePackage(opts("nope"))).rejects.toMatchObject({
      code: "REF_NOT_FOUND",
    });
    await expect(
      resolvePackage(opts("latest", { appId: "com.example.ghost" })),
    ).rejects.toMatchObject({
      code: "APP_NOT_FOUND",
    });
    const pkgHitsBefore = hits["/com.example.todo/1.1.0/app.mpkg"];
    rmSync(join(cacheDir, "com.example.todo/1.1.0.meta.json"), { force: true });
    await expect(
      resolvePackage(opts("1.1.0", { isRuntimeSupported: () => false })),
    ).rejects.toMatchObject({ code: "RUNTIME_INCOMPATIBLE" });
    expect(hits["/com.example.todo/1.1.0/app.mpkg"]).toBe(pkgHitsBefore); // compat check happens BEFORE download
  });
});
