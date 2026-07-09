import { describe, expect, it } from "vitest";
import { ResolverError } from "./errors.js";
import { parseAppManifest } from "./app-manifest.js";

const VALID = {
  manifestVersion: 1,
  id: "com.example.todo",
  name: "Todo",
  version: "0.1.0",
  runtimeVersion: ">=0.0.0",
  permissions: ["storage"],
  allowedDomains: ["https://api.test"],
};

describe("parseAppManifest", () => {
  it("reads the host-relevant fields and defaults the rest", () => {
    const m = parseAppManifest(JSON.stringify(VALID), "x");
    expect(m).toEqual({
      id: "com.example.todo",
      name: "Todo",
      version: "0.1.0",
      entry: "index.html",
      permissions: ["storage"],
      allowedDomains: ["https://api.test"],
    });
  });

  it("defaults permissions/allowedDomains to empty (deny-by-default)", () => {
    const m = parseAppManifest(
      JSON.stringify({ id: "a", name: "A", version: "1.0.0" }),
      "x",
    );
    expect(m.permissions).toEqual([]);
    expect(m.allowedDomains).toEqual([]);
  });

  it("throws BAD_PACKAGE on missing, unparsable, or invalid manifests", () => {
    for (const text of [
      null,
      "not json",
      JSON.stringify({ name: "no id or version" }),
    ]) {
      let caught: unknown;
      try {
        parseAppManifest(text, "x");
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(ResolverError);
      expect((caught as ResolverError).code).toBe("BAD_PACKAGE");
    }
  });
});
