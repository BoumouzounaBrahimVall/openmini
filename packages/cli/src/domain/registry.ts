/** Registry index types — specs/registry-protocol.md §2. */
export const REGISTRY_VERSION = 1;

export interface RegistryVersionEntry {
  package: string;
  sha256: string;
  size: number;
  runtimeVersion: string;
  publishedAt: string;
}

export interface RegistryIndex {
  registryVersion: typeof REGISTRY_VERSION;
  id: string;
  name: string;
  latest: string;
  channels?: Record<string, string>;
  versions: Record<string, RegistryVersionEntry>;
}
