import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strToU8 } from "fflate";
import { afterAll, describe, expect, it } from "vitest";
import { fsRegistryTarget } from "../adapters/node/fs-registry.js";
import {
  s3RegistryTarget,
  type S3LikeClient,
} from "../adapters/s3/s3-registry.js";
import type { RegistryIndex } from "../domain/registry.js";
import { packApp, sha256 } from "./pack.js";
import { publishPackage, type RegistryTarget } from "./publish.js";

const NOW = new Date("2026-07-08T12:00:00Z");

function makePackage(version: string): Uint8Array {
  return packApp({
    files: {
      "index.html": strToU8("<html><head></head><body>v</body></html>"),
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

function memoryTarget() {
  const store = new Map<string, string | Uint8Array>();
  const log: string[] = [];
  const target: RegistryTarget = {
    readText: (p) =>
      Promise.resolve((store.get(p) as string | undefined) ?? null),
    writeBytes: (p, b) => {
      log.push(`bytes:${p}`);
      store.set(p, b);
      return Promise.resolve();
    },
    writeTextAtomic: (p, t) => {
      log.push(`atomic:${p}`);
      store.set(p, t);
      return Promise.resolve();
    },
  };
  return { target, store, log };
}

describe("mini publish (use case)", () => {
  it("writes the spec layout, package BEFORE index, correct sha256", async () => {
    const { target, store, log } = memoryTarget();
    const bytes = makePackage("0.1.0");
    await publishPackage({ bytes, target, now: NOW });
    expect(log).toEqual([
      "bytes:com.example.todo/0.1.0/app.mpkg",
      "atomic:com.example.todo/index.json",
    ]);
    const index = JSON.parse(
      store.get("com.example.todo/index.json") as string,
    ) as RegistryIndex;
    expect(index).toMatchObject({
      registryVersion: 1,
      id: "com.example.todo",
      name: "Todo",
      latest: "0.1.0",
    });
    expect(index.versions["0.1.0"]).toEqual({
      package: "0.1.0/app.mpkg",
      sha256: sha256(bytes),
      size: bytes.byteLength,
      runtimeVersion: "0.1.0",
      publishedAt: "2026-07-08T12:00:00.000Z",
    });
  });

  it("versions are immutable; --force replaces; new versions move latest", async () => {
    const { target, store } = memoryTarget();
    await publishPackage({ bytes: makePackage("0.1.0"), target, now: NOW });
    await expect(
      publishPackage({ bytes: makePackage("0.1.0"), target, now: NOW }),
    ).rejects.toThrow(/immutable/);
    await publishPackage({
      bytes: makePackage("0.1.0"),
      target,
      force: true,
      now: NOW,
    });
    await publishPackage({ bytes: makePackage("0.2.0"), target, now: NOW });
    const index = JSON.parse(
      store.get("com.example.todo/index.json") as string,
    ) as RegistryIndex;
    expect(Object.keys(index.versions).sort()).toEqual(["0.1.0", "0.2.0"]);
    expect(index.latest).toBe("0.2.0");
  });

  it("rejects an invalid package and foreign indexes", async () => {
    const { target } = memoryTarget();
    await expect(
      publishPackage({ bytes: strToU8("junk"), target, now: NOW }),
    ).rejects.toThrow(/invalid/);
  });

  it("s3-style target maps paths to keys with cache metadata", async () => {
    const puts: Record<string, { contentType: string; cacheControl: string }> =
      {};
    const texts = new Map<string, string>();
    const client: S3LikeClient = {
      putObject: ({ key, body, contentType, cacheControl }) => {
        puts[key] = { contentType, cacheControl };
        if (typeof body === "string") texts.set(key, body);
        return Promise.resolve();
      },
      getObjectText: (key) => Promise.resolve(texts.get(key) ?? null),
    };
    await publishPackage({
      bytes: makePackage("0.1.0"),
      target: s3RegistryTarget(client, "apps"),
      now: NOW,
    });
    expect(puts["apps/com.example.todo/0.1.0/app.mpkg"]).toEqual({
      contentType: "application/zip",
      cacheControl: "public, max-age=31536000, immutable",
    });
    expect(puts["apps/com.example.todo/index.json"]).toEqual({
      contentType: "application/json",
      cacheControl: "no-cache",
    });
  });
});

describe("mini publish round-trip over a static server (AC)", () => {
  const dir = mkdtempSync(join(tmpdir(), "openmini-registry-"));
  let server: Server;
  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    rmSync(dir, { recursive: true, force: true });
  });

  it("pack -> publish -> serve -> fetch index + package, sha256 verified", async () => {
    const bytes = makePackage("1.0.0");
    await publishPackage({ bytes, target: fsRegistryTarget(dir), now: NOW });
    expect(readdirSync(join(dir, "com.example.todo")).sort()).toEqual([
      "1.0.0",
      "index.json",
    ]);
    expect(readdirSync(dir).join()).not.toContain(".tmp-"); // atomic write left no temp files

    server = createServer((req, res) => {
      try {
        res.end(readFileSync(join(dir, decodeURIComponent(req.url ?? "/"))));
      } catch {
        res.writeHead(404).end();
      }
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const address = server.address();
    if (address === null || typeof address === "string")
      throw new Error("no port");
    const base = `http://127.0.0.1:${address.port}`;

    const index = (await (
      await fetch(`${base}/com.example.todo/index.json`)
    ).json()) as RegistryIndex;
    const entry = index.versions[index.latest];
    expect(entry).toBeDefined();
    const pkg = new Uint8Array(
      await (
        await fetch(`${base}/com.example.todo/${entry?.package ?? ""}`)
      ).arrayBuffer(),
    );
    expect(sha256(pkg)).toBe(entry?.sha256);
  });
});
