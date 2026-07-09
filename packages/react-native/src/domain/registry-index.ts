/**
 * Registry index parsing + ref resolution — specs/registry-protocol.md §2–3.
 * Pure domain; mirrors @openmini/cli's publisher-side types (the protocol is
 * the shared contract, not a shared package — hosts must stay independent).
 */
import { ResolverError } from "./errors.js";

export interface RegistryVersionEntry {
  package: string;
  sha256: string;
  size: number;
  runtimeVersion: string;
  publishedAt: string;
}

export interface RegistryIndex {
  registryVersion: 1;
  id: string;
  name: string;
  latest: string;
  channels?: Record<string, string>;
  versions: Record<string, RegistryVersionEntry>;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function parseRegistryIndex(
  text: string,
  expectedAppId: string,
): RegistryIndex {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ResolverError(
      "INDEX_INVALID",
      "registry index is not valid JSON",
    );
  }
  if (!isRecord(value) || value["registryVersion"] !== 1) {
    throw new ResolverError(
      "INDEX_INVALID",
      "registry index has an unsupported registryVersion",
    );
  }
  if (value["id"] !== expectedAppId) {
    throw new ResolverError(
      "INDEX_INVALID",
      `registry index id ${String(value["id"])} != ${expectedAppId}`,
    );
  }
  if (typeof value["latest"] !== "string" || !isRecord(value["versions"])) {
    throw new ResolverError(
      "INDEX_INVALID",
      "registry index is missing latest/versions",
    );
  }
  return value as unknown as RegistryIndex;
}

/** `ref` is an exact version, "latest", or a channel name (spec §3). */
export function resolveRef(
  index: RegistryIndex,
  ref: string,
): { version: string; entry: RegistryVersionEntry } {
  const version =
    ref in index.versions
      ? ref
      : ref === "latest"
        ? index.latest
        : index.channels?.[ref];
  const entry = version === undefined ? undefined : index.versions[version];
  if (version === undefined || entry === undefined) {
    throw new ResolverError(
      "REF_NOT_FOUND",
      `no version for ref "${ref}" of ${index.id}`,
    );
  }
  return { version, entry };
}
