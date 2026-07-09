/** Drift guard for the CSP template in specs/package-format.md §4. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildCsp } from "./csp.js";

function directives(policy: string): Map<string, string> {
  return new Map(
    policy
      .split(";")
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => {
        const [name, ...rest] = d.split(/\s+/);
        return [name ?? "", rest.join(" ")] as const;
      }),
  );
}

describe("CSP template <-> spec sync", () => {
  it("buildCsp matches the canonical template in specs/package-format.md", () => {
    const spec = readFileSync(
      fileURLToPath(
        new URL("../../../../specs/package-format.md", import.meta.url),
      ),
      "utf8",
    );
    const fence = [...spec.matchAll(/```txt\n([\s\S]*?)```/g)]
      .map((m) => m[1] ?? "")
      .find((body) => body.includes("default-src"));
    if (fence === undefined)
      throw new Error("no CSP template fence in specs/package-format.md");
    const fromSpec = directives(fence.replaceAll("\n", " "));
    const generated = directives(buildCsp(["{connect}"]));
    expect(generated).toEqual(fromSpec);
  });

  it("empty allowedDomains keeps 'self' so packaged assets stay fetchable", () => {
    expect(buildCsp([])).toContain("connect-src 'self'");
    expect(buildCsp(["https://api.example.com"])).toContain(
      "connect-src 'self' https://api.example.com",
    );
  });
});
