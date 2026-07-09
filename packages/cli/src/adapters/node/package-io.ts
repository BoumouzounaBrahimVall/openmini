import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

/** Reads a built output dir into package-relative posix paths -> bytes. */
export function readDirBytes(dir: string): Record<string, Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  for (const entry of readdirSync(dir, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!entry.isFile()) continue;
    const abs = join(entry.parentPath, entry.name);
    files[relative(dir, abs).split(sep).join("/")] = new Uint8Array(
      readFileSync(abs),
    );
  }
  return files;
}

/** Exact bundled @openmini/runtime version for hashes.json (spec §3). */
export function resolveRuntimeVersion(appDir: string): {
  version: string;
  warning?: string;
} {
  try {
    const pkg = JSON.parse(
      readFileSync(
        join(appDir, "node_modules/@openmini/runtime/package.json"),
        "utf8",
      ),
    ) as { version?: string };
    if (typeof pkg.version === "string") return { version: pkg.version };
  } catch {
    // fall through
  }
  return {
    version: "0.0.0",
    warning:
      "@openmini/runtime not found in the app's node_modules — recorded runtimeVersion 0.0.0",
  };
}
