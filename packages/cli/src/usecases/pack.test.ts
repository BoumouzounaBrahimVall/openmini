import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { inspectPackage } from "./inspect.js";
import { packApp, sha256 } from "./pack.js";

const MANIFEST = JSON.stringify({
  manifestVersion: 1,
  id: "com.example.todo",
  name: "Todo",
  version: "0.1.0",
  runtimeVersion: ">=0.0.0",
  permissions: ["network"],
  allowedDomains: ["https://api.example.com"],
});

const FILES = () => ({
  "index.html": strToU8(
    "<!doctype html>\n<html><head><title>t</title></head><body></body></html>",
  ),
  "assets/app.js": strToU8("console.debug('hi')"),
});

describe("mini pack", () => {
  it("emits a spec-compliant package: CSP injected, hashes correct, named by id+version", () => {
    const result = packApp({
      files: FILES(),
      manifestSource: MANIFEST,
      runtimeVersion: "1.2.3",
    });
    expect(result.artifactName).toBe("todo-0.1.0.mpkg");
    const entries = unzipSync(result.bytes);
    expect(Object.keys(entries).sort()).toEqual([
      "assets/app.js",
      "hashes.json",
      "index.html",
      "manifest.json",
    ]);
    const html = strFromU8(entries["index.html"] as Uint8Array);
    expect(html).toContain('http-equiv="Content-Security-Policy"');
    expect(html).toContain("connect-src 'self' https://api.example.com");
    const hashes = JSON.parse(
      strFromU8(entries["hashes.json"] as Uint8Array),
    ) as {
      algorithm: string;
      runtimeVersion: string;
      files: Record<string, string>;
    };
    expect(hashes.algorithm).toBe("sha256");
    expect(hashes.runtimeVersion).toBe("1.2.3");
    expect(hashes.files["index.html"]).toBe(
      sha256(entries["index.html"] as Uint8Array),
    );
    expect(hashes.files["assets/app.js"]).toBe(
      sha256(entries["assets/app.js"] as Uint8Array),
    );
    expect(result.packageSha256).toBe(sha256(result.bytes));
  });

  it("is deterministic: identical inputs -> identical bytes", () => {
    const a = packApp({
      files: FILES(),
      manifestSource: MANIFEST,
      runtimeVersion: "1.2.3",
    });
    const b = packApp({
      files: FILES(),
      manifestSource: MANIFEST,
      runtimeVersion: "1.2.3",
    });
    expect(sha256(a.bytes)).toBe(sha256(b.bytes));
  });

  it("replaces an authored CSP with a warning", () => {
    const files = FILES();
    files["index.html"] = strToU8(
      `<html><head><meta http-equiv="Content-Security-Policy" content="default-src *" /></head><body></body></html>`,
    );
    const result = packApp({
      files,
      manifestSource: MANIFEST,
      runtimeVersion: "1.2.3",
    });
    expect(result.warnings.join()).toContain(
      "authored Content-Security-Policy",
    );
    const html = strFromU8(unzipSync(result.bytes)["index.html"] as Uint8Array);
    expect(html).not.toContain("default-src *");
    expect(html).toContain("default-src 'none'");
  });

  it("fails loudly on invalid manifest, missing entry, illegal paths", () => {
    expect(() =>
      packApp({ files: FILES(), manifestSource: "{}", runtimeVersion: "1" }),
    ).toThrow(/manifest/);
    expect(() =>
      packApp({
        files: { "app.js": strToU8("x") },
        manifestSource: MANIFEST,
        runtimeVersion: "1",
      }),
    ).toThrow(/entry document/);
    expect(() =>
      packApp({
        files: { ...FILES(), "../evil.js": strToU8("x") },
        manifestSource: MANIFEST,
        runtimeVersion: "1",
      }),
    ).toThrow(/illegal package path/);
  });
});

describe("mini inspect", () => {
  const packed = () =>
    packApp({
      files: FILES(),
      manifestSource: MANIFEST,
      runtimeVersion: "1.2.3",
    });

  it("accepts what pack produces", () => {
    const result = inspectPackage(packed().bytes);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.summary).toMatchObject({
      id: "com.example.todo",
      version: "0.1.0",
      runtimeVersion: "1.2.3",
    });
  });

  it("detects tampering (hash mismatch) after repack", () => {
    const entries = unzipSync(packed().bytes);
    entries["assets/app.js"] = strToU8("console.debug('EVIL')");
    const result = inspectPackage(zipSync(entries));
    expect(result.ok).toBe(false);
    expect(result.errors.join()).toContain("hash mismatch for assets/app.js");
  });

  it("flags missing manifest fields, traversal names, missing hashed files", () => {
    expect(
      inspectPackage(zipSync({ "manifest.json": strToU8("{}") })).errors.join(),
    ).toMatch(/manifest/);
    const entries = unzipSync(packed().bytes);
    const bad = zipSync({ ...entries, "../escape.js": strToU8("x") });
    expect(inspectPackage(bad).errors.join()).toContain("illegal entry path");
    const withoutFile = Object.fromEntries(
      Object.entries(entries).filter(([n]) => n !== "assets/app.js"),
    );
    expect(inspectPackage(zipSync(withoutFile)).errors.join()).toContain(
      "references missing file",
    );
    expect(inspectPackage(strToU8("not a zip")).errors.join()).toContain(
      "not a readable zip",
    );
  });
});
