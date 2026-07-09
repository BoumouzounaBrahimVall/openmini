import { createHash } from "node:crypto";
import { strFromU8, strToU8, zipSync, type Zippable } from "fflate";
import { buildCsp, injectCsp } from "../domain/csp.js";
import type { Manifest } from "../domain/manifest-schema.js";
import { CliError } from "./create-app.js";
import { parseManifest } from "./validate-manifest.js";

/** Fixed mtime for deterministic archives (spec §1). */
const PACK_EPOCH = new Date("2000-01-01T00:00:00Z");

export interface PackOptions {
  /** Built app files, package-relative paths (posix separators). */
  files: Record<string, Uint8Array>;
  manifestSource: string;
  /** Exact @openmini/runtime version bundled (hashes.json, spec §3). */
  runtimeVersion: string;
}

export interface PackResult {
  manifest: Manifest;
  artifactName: string;
  bytes: Uint8Array;
  packageSha256: string;
  warnings: string[];
}

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

const BAD_ENTRY = /^\/|^[a-zA-Z]:|\\|(^|\/)\.\.(\/|$)/;

/** Assembles a spec-compliant .mpkg from built files (pure: no I/O). */
export function packApp(options: PackOptions): PackResult {
  const warnings: string[] = [];
  const parsed = parseManifest(options.manifestSource);
  if (!parsed.ok) {
    throw new CliError(
      `cannot pack, manifest.json is invalid:\n  - ${parsed.errors.join("\n  - ")}`,
    );
  }
  const manifest = parsed.manifest;
  const entry = manifest.entry ?? "index.html";

  const files = new Map<string, Uint8Array>();
  for (const [name, content] of Object.entries(options.files)) {
    if (BAD_ENTRY.test(name))
      throw new CliError(
        `illegal package path: ${name} (spec: package-format.md §1)`,
      );
    if (name === "manifest.json" || name === "hashes.json") {
      warnings.push(
        `build output contains reserved file ${name} — replaced by the packer`,
      );
      continue;
    }
    files.set(name, content);
  }
  const entryHtml = files.get(entry);
  if (entryHtml === undefined) {
    throw new CliError(`entry document "${entry}" missing from build output`);
  }

  // Build-time CSP from allowedDomains — the enforceable half of decision #7.
  const injected = injectCsp(
    strFromU8(entryHtml),
    buildCsp(manifest.allowedDomains ?? []),
  );
  if (injected.replacedAuthored) {
    warnings.push(
      `authored Content-Security-Policy in ${entry} was replaced with the generated policy`,
    );
  }
  files.set(entry, strToU8(injected.html));
  files.set("manifest.json", strToU8(options.manifestSource));

  const hashes = {
    algorithm: "sha256" as const,
    runtimeVersion: options.runtimeVersion,
    files: Object.fromEntries(
      [...files.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, c]) => [name, sha256(c)]),
    ),
  };
  files.set("hashes.json", strToU8(`${JSON.stringify(hashes, null, 2)}\n`));

  const zippable: Zippable = Object.fromEntries(
    [...files.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([name, content]) => [name, [content, { mtime: PACK_EPOCH }]] as const,
      ),
  );
  const bytes = zipSync(zippable, { level: 6, mtime: PACK_EPOCH });
  return {
    manifest,
    artifactName: `${manifest.id.split(".").at(-1) ?? "app"}-${manifest.version}.mpkg`,
    bytes,
    packageSha256: sha256(bytes),
    warnings,
  };
}
