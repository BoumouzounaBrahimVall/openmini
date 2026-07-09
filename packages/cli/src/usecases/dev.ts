import type { Manifest } from "../domain/manifest-schema.js";
import { CliError, type FileSystemPort } from "./create-app.js";
import { parseManifest } from "./validate-manifest.js";

/** Reads and validates the app's manifest.json, with actionable errors. */
export function loadManifest(appDir: string, fs: FileSystemPort): Manifest {
  const path = fs.join(appDir, "manifest.json");
  if (!fs.exists(path)) {
    throw new CliError(
      `no manifest.json in ${appDir} — is this an OpenMini app? (try \`mini create\`)`,
    );
  }
  const result = parseManifest(fs.readFile(path));
  if (!result.ok) {
    throw new CliError(
      `manifest.json is invalid:\n  - ${result.errors.join("\n  - ")}`,
    );
  }
  return result.manifest;
}
