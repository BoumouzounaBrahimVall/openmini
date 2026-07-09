import { strFromU8, unzipSync } from "fflate";
import { CliError } from "./create-app.js";
import { sha256 } from "./pack.js";
import { parseManifest } from "./validate-manifest.js";

export interface InspectSummary {
  id: string;
  name: string;
  version: string;
  entry: string;
  fileCount: number;
  byteSize: number;
  packageSha256: string;
  runtimeVersion: string;
}

export interface InspectResult {
  ok: boolean;
  errors: string[];
  summary?: InspectSummary;
}

const BAD_ENTRY = /^\/|^[a-zA-Z]:|\\|(^|\/)\.\.(\/|$)/;

/** Validates an .mpkg against specs/package-format.md. Loud on every failure. */
export function inspectPackage(bytes: Uint8Array): InspectResult {
  const errors: string[] = [];
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch (cause) {
    return {
      ok: false,
      errors: [
        `not a readable zip archive: ${cause instanceof Error ? cause.message : ""}`,
      ],
    };
  }

  for (const name of Object.keys(entries)) {
    if (BAD_ENTRY.test(name))
      errors.push(`illegal entry path: ${name} (container rules, spec §1)`);
  }

  const manifestBytes = entries["manifest.json"];
  if (manifestBytes === undefined) {
    errors.push("manifest.json missing from package root");
    return { ok: false, errors };
  }
  const parsed = parseManifest(strFromU8(manifestBytes));
  if (!parsed.ok) {
    errors.push(...parsed.errors);
    return { ok: false, errors };
  }
  const manifest = parsed.manifest;
  const entry = manifest.entry ?? "index.html";
  if (!(entry in entries))
    errors.push(`entry document "${entry}" not found in package`);

  const hashesBytes = entries["hashes.json"];
  let runtimeVersion = "";
  if (hashesBytes === undefined) {
    errors.push("hashes.json missing from package root");
  } else {
    try {
      const hashes = JSON.parse(strFromU8(hashesBytes)) as {
        algorithm?: unknown;
        runtimeVersion?: unknown;
        files?: Record<string, unknown>;
      };
      if (hashes.algorithm !== "sha256")
        errors.push(`hashes.json algorithm must be "sha256"`);
      if (typeof hashes.runtimeVersion !== "string")
        errors.push("hashes.json runtimeVersion missing");
      else runtimeVersion = hashes.runtimeVersion;
      const declared = hashes.files ?? {};
      for (const [name, content] of Object.entries(entries)) {
        if (name === "hashes.json") continue;
        const expected = declared[name];
        if (expected === undefined)
          errors.push(`file not covered by hashes.json: ${name}`);
        else if (expected !== sha256(content))
          errors.push(
            `hash mismatch for ${name} — package corrupted or tampered`,
          );
      }
      for (const name of Object.keys(declared)) {
        if (!(name in entries))
          errors.push(`hashes.json references missing file: ${name}`);
      }
    } catch {
      errors.push("hashes.json is not valid JSON");
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    summary: {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      entry,
      fileCount: Object.keys(entries).length,
      byteSize: bytes.byteLength,
      packageSha256: sha256(bytes),
      runtimeVersion,
    },
  };
}

/** Convenience for the CLI: throws a CliError with the full error list. */
export function assertValidPackage(bytes: Uint8Array): InspectSummary {
  const result = inspectPackage(bytes);
  if (!result.ok || result.summary === undefined) {
    throw new CliError(
      `package is invalid:\n  - ${result.errors.join("\n  - ")}`,
    );
  }
  return result.summary;
}
