/**
 * Native adapters for the resolver's FileStore/Hasher ports,
 * backed by the OpenMiniFiles native module (Kotlin/Swift).
 */
import { NativeModules } from "react-native";
import type { FileStore } from "../../ports/file-store.js";
import type { Hasher } from "../../ports/hasher.js";
import { bytesToBase64 } from "./base64.js";

interface OpenMiniFilesModule {
  getCacheDir(): Promise<string>;
  exists(path: string): Promise<boolean>;
  readText(path: string): Promise<string | null>;
  writeFileBase64(path: string, base64: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  removeDir(path: string): Promise<void>;
  sha256Base64(base64: string): Promise<string>;
}

function module_(): OpenMiniFilesModule {
  const m = (NativeModules as Record<string, unknown>)["OpenMiniFiles"];
  if (m === undefined) {
    throw new Error(
      "OpenMiniFiles native module not linked - rebuild the host app after installing @openmini/react-native",
    );
  }
  return m as OpenMiniFilesModule;
}

/** App-private base directory for the package cache. */
export function nativeCacheDir(): Promise<string> {
  return module_().getCacheDir();
}

export const nativeFileStore: FileStore = {
  exists: (path) => module_().exists(path),
  readText: (path) => module_().readText(path),
  writeFile: (path, content) =>
    module_().writeFileBase64(
      path,
      typeof content === "string"
        ? bytesToBase64(new TextEncoder().encode(content))
        : bytesToBase64(content),
    ),
  rename: (from, to) => module_().rename(from, to),
  removeDir: (path) => module_().removeDir(path),
};

export const nativeHasher: Hasher = {
  sha256: (bytes) => module_().sha256Base64(bytesToBase64(bytes)),
};
