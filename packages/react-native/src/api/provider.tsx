/**
 * <MiniAppProvider> — the host SDK's composition root (specs/architecture.md):
 * this is the ONE place where the resolver's ports get their native adapters
 * and where host-level configuration (registry, storage, custom APIs) lives.
 * Every <MiniAppView> below it inherits this context.
 */
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { fetchHttpClient } from "../adapters/fetch-http.js";
import { memoryKvStorage } from "../adapters/memory-storage.js";
import {
  nativeCacheDir,
  nativeFileStore,
  nativeHasher,
} from "../adapters/native/files.js";
import type { FileStore } from "../ports/file-store.js";
import type { Hasher } from "../ports/hasher.js";
import type { HttpClient } from "../ports/http.js";
import type { KvStorage } from "../ports/kv-storage.js";
import type { CustomApis } from "../usecases/define-host-api.js";

export interface MiniAppProviderProps {
  /**
   * Base URL of a static registry (specs/registry-protocol.md) — any static
   * file host works: an S3 bucket, a CDN, `mini publish --registry` output.
   */
  registryUrl: string;
  /**
   * Host-defined APIs exposed to mini-apps as `mini.host.invoke(name, payload)`
   * (bridge-protocol §5.1) — plain handlers keyed by BARE name, or
   * schema-validated `defineHostApi` definitions. The `host.` prefix is added
   * by the protocol, so built-in APIs can never be shadowed. A mini-app must
   * declare `host:<name>` in its manifest permissions to call one.
   */
  customApis?: CustomApis;
  /**
   * Storage behind `mini.storage`, namespaced per appId by the bridge host.
   * Defaults to a NON-persistent in-memory store; pass `asyncStorageKv()`
   * from "@openmini/react-native/async-storage" for real persistence.
   */
  storage?: KvStorage;
  children: ReactNode;
}

export interface MiniAppContextValue {
  registryUrl: string;
  customApis?: CustomApis;
  storage: KvStorage;
  http: HttpClient;
  files: FileStore;
  hasher: Hasher;
  cacheDir(): Promise<string>;
}

const MiniAppContext = createContext<MiniAppContextValue | null>(null);

export function MiniAppProvider({
  registryUrl,
  customApis,
  storage,
  children,
}: MiniAppProviderProps) {
  const value = useMemo<MiniAppContextValue>(
    () => ({
      registryUrl,
      customApis,
      storage: storage ?? memoryKvStorage(),
      http: fetchHttpClient(),
      files: nativeFileStore,
      hasher: nativeHasher,
      cacheDir: nativeCacheDir,
    }),
    [registryUrl, customApis, storage],
  );
  return (
    <MiniAppContext.Provider value={value}>{children}</MiniAppContext.Provider>
  );
}

/** Internal: MiniAppView's access to the provider (throws outside one). */
export function useMiniAppContext(): MiniAppContextValue {
  const value = useContext(MiniAppContext);
  if (value === null) {
    throw new Error("<MiniAppView> must be rendered inside <MiniAppProvider>");
  }
  return value;
}
