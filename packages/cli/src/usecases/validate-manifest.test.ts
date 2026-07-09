import { describe, expect, it } from "vitest";
import { parseManifest, validateManifest } from "./validate-manifest.js";

const valid = {
  manifestVersion: 1,
  id: "com.example.todo",
  name: "Todo",
  version: "0.1.0",
  runtimeVersion: ">=0.1.0",
  permissions: ["storage", "host:getUser"],
  allowedDomains: ["https://api.example.com", "http://localhost:3000"],
};

describe("manifest validation", () => {
  it("accepts a valid manifest including host:<name> permissions", () => {
    expect(validateManifest(valid)).toEqual({ ok: true, manifest: valid });
  });

  it("reports missing/invalid fields with paths", () => {
    const result = validateManifest({
      manifestVersion: 1,
      id: "nodots",
      version: "x",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join("\n")).toMatch(/name/);
    expect(result.errors.join("\n")).toMatch(/manifest\.id/);
    expect(result.errors.join("\n")).toMatch(/manifest\.version/);
  });

  it("rejects unknown permissions and unknown top-level fields", () => {
    expect(validateManifest({ ...valid, permissions: ["camera"] }).ok).toBe(
      false,
    );
    expect(validateManifest({ ...valid, totallyUnknown: true }).ok).toBe(false);
  });

  it("rejects non-localhost http origins", () => {
    expect(
      validateManifest({
        ...valid,
        allowedDomains: ["http://insecure.example"],
      }).ok,
    ).toBe(false);
  });

  it("parseManifest reports broken JSON readably", () => {
    const result = parseManifest("{nope");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toContain("not valid JSON");
  });
});
