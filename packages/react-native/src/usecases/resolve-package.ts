import { strFromU8, unzipSync } from "fflate";
import { ResolverError } from "../domain/errors.js";
import { parseRegistryIndex, resolveRef } from "../domain/registry-index.js";
import type { FileStore } from "../ports/file-store.js";
import type { Hasher } from "../ports/hasher.js";
import type { HttpClient } from "../ports/http.js";

export interface ResolveOptions {
  registryUrl: string;
  appId: string;
  /** Exact version, "latest", or a channel name. */
  ref: string;
  cacheDir: string;
  http: HttpClient;
  files: FileStore;
  hasher: Hasher;
  /**
   * Host compatibility policy for the package's bundled runtime version
   * (specs/registry-protocol.md §3 step 3). Default: accept everything —
   * the host SDK wires its real policy here.
   */
  isRuntimeSupported?: (bundledRuntimeVersion: string) => boolean;
}

export interface ResolvedPackage {
  appId: string;
  version: string;
  sha256: string;
  /** Directory containing the verified, extracted package. */
  appDir: string;
  fromCache: boolean;
}

const EXACT_VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z-.]+)?$/;
const BAD_ENTRY = /^\/|^[a-zA-Z]:|\\|(^|\/)\.\.(\/|$)/;

interface CacheMeta {
  sha256: string;
}

/**
 * Registry fetch flow per specs/registry-protocol.md §3:
 * revalidate index -> resolve ref -> compat pre-check -> download ->
 * VERIFY sha256 BEFORE extraction -> container + per-file checks ->
 * content-addressed cache. Failures never touch existing cache entries.
 */
export async function resolvePackage(
  options: ResolveOptions,
): Promise<ResolvedPackage> {
  const { appId, ref, http, files, hasher } = options;
  const base = options.registryUrl.replace(/\/+$/, "");
  const appCache = `${options.cacheDir}/${appId}`;

  // Pinned version already verified in cache: no network at all (spec §3.5).
  if (EXACT_VERSION.test(ref)) {
    const cached = await readCacheMeta(files, appCache, ref);
    if (cached !== null) {
      return {
        appId,
        version: ref,
        sha256: cached.sha256,
        appDir: `${appCache}/${ref}`,
        fromCache: true,
      };
    }
  }

  let indexText: string | null;
  try {
    indexText = await http.getText(`${base}/${appId}/index.json`);
  } catch (cause) {
    throw new ResolverError(
      "FETCH_FAILED",
      `could not fetch registry index for ${appId}`,
      cause,
    );
  }
  if (indexText === null)
    throw new ResolverError("APP_NOT_FOUND", `${appId} not found at ${base}`);
  const index = parseRegistryIndex(indexText, appId);
  const { version, entry } = resolveRef(index, ref);

  if (options.isRuntimeSupported?.(entry.runtimeVersion) === false) {
    throw new ResolverError(
      "RUNTIME_INCOMPATIBLE",
      `${appId}@${version} bundles runtime ${entry.runtimeVersion}, unsupported by this host`,
    );
  }

  const appDir = `${appCache}/${version}`;
  const cached = await readCacheMeta(files, appCache, version);
  if (cached !== null && cached.sha256 === entry.sha256) {
    return { appId, version, sha256: entry.sha256, appDir, fromCache: true };
  }

  let bytes: Uint8Array;
  try {
    bytes = await http.getBytes(`${base}/${appId}/${entry.package}`);
  } catch (cause) {
    throw new ResolverError(
      "FETCH_FAILED",
      `could not download ${appId}@${version}`,
      cause,
    );
  }

  // Integrity gate BEFORE anything touches the archive (spec + decision #7).
  const actual = await hasher.sha256(bytes);
  if (actual !== entry.sha256) {
    throw new ResolverError(
      "HASH_MISMATCH",
      `${appId}@${version}: package sha256 ${actual} != registry ${entry.sha256} — refusing to install`,
    );
  }

  const contents = safeExtract(bytes, `${appId}@${version}`);
  await verifyFileHashes(hasher, contents, `${appId}@${version}`);

  // Stage, then atomically rename into place; failures leave no partial dir.
  const staging = `${appCache}/.staging-${version}`;
  try {
    for (const [name, data] of Object.entries(contents)) {
      await files.writeFile(`${staging}/${name}`, data);
    }
    if (await files.exists(appDir)) await files.removeDir(appDir);
    await files.rename(staging, appDir);
    await files.writeFile(
      metaPath(appCache, version),
      JSON.stringify({ sha256: entry.sha256 }),
    );
  } catch (cause) {
    await files.removeDir(staging).catch(() => {});
    throw new ResolverError(
      "BAD_PACKAGE",
      `failed to install ${appId}@${version}`,
      cause,
    );
  }
  return { appId, version, sha256: entry.sha256, appDir, fromCache: false };
}

function metaPath(appCache: string, version: string): string {
  return `${appCache}/${version}.meta.json`;
}

async function readCacheMeta(
  files: FileStore,
  appCache: string,
  version: string,
): Promise<CacheMeta | null> {
  const text = await files.readText(metaPath(appCache, version));
  if (text === null || !(await files.exists(`${appCache}/${version}`)))
    return null;
  try {
    const meta = JSON.parse(text) as CacheMeta;
    return typeof meta.sha256 === "string" ? meta : null;
  } catch {
    return null;
  }
}

function safeExtract(
  bytes: Uint8Array,
  label: string,
): Record<string, Uint8Array> {
  let contents: Record<string, Uint8Array>;
  try {
    contents = unzipSync(bytes);
  } catch (cause) {
    throw new ResolverError(
      "BAD_PACKAGE",
      `${label}: not a readable package archive`,
      cause,
    );
  }
  for (const name of Object.keys(contents)) {
    if (BAD_ENTRY.test(name)) {
      throw new ResolverError(
        "BAD_PACKAGE",
        `${label}: illegal entry path ${name} (container rules)`,
      );
    }
  }
  if (!("manifest.json" in contents) || !("hashes.json" in contents)) {
    throw new ResolverError(
      "BAD_PACKAGE",
      `${label}: missing manifest.json or hashes.json`,
    );
  }
  return contents;
}

async function verifyFileHashes(
  hasher: Hasher,
  contents: Record<string, Uint8Array>,
  label: string,
): Promise<void> {
  let declared: Record<string, string>;
  try {
    // fflate's pure-JS decode — Hermes has no TextDecoder (device-only gap).
    const parsed = JSON.parse(
      strFromU8(contents["hashes.json"] as Uint8Array),
    ) as {
      algorithm?: unknown;
      files?: Record<string, string>;
    };
    if (parsed.algorithm !== "sha256" || parsed.files === undefined)
      throw new Error("bad hashes.json");
    declared = parsed.files;
  } catch (cause) {
    throw new ResolverError(
      "BAD_PACKAGE",
      `${label}: unreadable hashes.json`,
      cause,
    );
  }
  for (const [name, data] of Object.entries(contents)) {
    if (name === "hashes.json") continue;
    if (declared[name] !== (await hasher.sha256(data))) {
      throw new ResolverError(
        "BAD_PACKAGE",
        `${label}: per-file hash mismatch for ${name}`,
      );
    }
  }
}
