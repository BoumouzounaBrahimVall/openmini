/**
 * Integration: vite-build a minimal (react-free) app fixture, pack it with
 * the real pipeline, and validate with inspect. No node_modules needed.
 */
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { afterAll, describe, expect, it } from "vitest";
import { readDirBytes, resolveRuntimeVersion } from "../node/package-io.js";
import { inspectPackage } from "../../usecases/inspect.js";
import { packApp } from "../../usecases/pack.js";
import { buildApp } from "./build.js";

const appDir = mkdtempSync(join(tmpdir(), "openmini-build-"));
afterAll(() => rmSync(appDir, { recursive: true, force: true }));

function writeFixture(): void {
  writeFileSync(
    join(appDir, "manifest.json"),
    JSON.stringify({
      manifestVersion: 1,
      id: "com.example.buildsmoke",
      name: "BuildSmoke",
      version: "0.2.0",
      runtimeVersion: ">=0.0.0",
      permissions: [],
      allowedDomains: [],
    }),
  );
  writeFileSync(
    join(appDir, "index.html"),
    `<!doctype html><html><head><title>smoke</title></head><body><div id="root"></div><script type="module" src="/src/main.ts"></script></body></html>`,
  );
  mkdirSync(join(appDir, "src"), { recursive: true });
  writeFileSync(
    join(appDir, "src/main.ts"),
    `document.getElementById("root")!.textContent = "built";`,
  );
  mkdirSync(join(appDir, "public"), { recursive: true });
  writeFileSync(join(appDir, "public/data.json"), `{"hello":"openmini"}`);
}

describe("mini build + pack + inspect (real vite build)", () => {
  it("builds, packs a valid .mpkg with CSP, and inspect accepts it", async () => {
    writeFixture();
    const outDir = await buildApp(appDir);
    const files = readDirBytes(outDir);
    expect(Object.keys(files)).toContain("index.html");
    expect(Object.keys(files)).toContain("data.json");
    const result = packApp({
      files,
      manifestSource: readFileSync(join(appDir, "manifest.json"), "utf8"),
      runtimeVersion: resolveRuntimeVersion(appDir).version,
    });
    const report = inspectPackage(result.bytes);
    expect(report.errors).toEqual([]);
    const html = strFromU8(unzipSync(result.bytes)["index.html"] as Uint8Array);
    expect(html).toContain("connect-src 'self'");
    expect(result.artifactName).toBe("buildsmoke-0.2.0.mpkg");
  }, 30_000);
});
