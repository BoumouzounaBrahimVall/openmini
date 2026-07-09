/**
 * Drift guard: the spec (specs/manifest.md) is the source of truth for the
 * manifest schema; this package embeds a copy for ajv. If either side changes
 * without the other, THIS test fails — that is the sync mechanism the comment
 * in manifest-schema.ts refers to.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MANIFEST_SCHEMA } from "./manifest-schema.js";

function schemaFromSpec(): Record<string, unknown> {
  const spec = readFileSync(
    fileURLToPath(new URL("../../../../specs/manifest.md", import.meta.url)),
    "utf8",
  );
  const fences = [...spec.matchAll(/```json\n([\s\S]*?)```/g)].map(
    (m) => m[1] ?? "",
  );
  const raw = fences.find((body) => body.includes('"$schema"'));
  if (raw === undefined)
    throw new Error("no fenced JSON Schema found in specs/manifest.md");
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  delete parsed["$schema"]; // the embedded copy omits it deliberately (ajv dialect handling)
  return parsed;
}

describe("manifest schema <-> spec sync", () => {
  it("embedded MANIFEST_SCHEMA equals the canonical schema in specs/manifest.md", () => {
    expect(MANIFEST_SCHEMA).toEqual(schemaFromSpec());
  });
});
