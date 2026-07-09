/**
 * @openmini/react-native — host SDK (TS half).
 *
 * Resolver, native WebView module, bridge host, and
 * <MiniAppProvider>/<MiniAppView> all shipped.
 * Hexagonal: HttpClient/FileStore/Hasher/KvStorage are ports; the
 * AsyncStorage adapter lives behind the "./async-storage" subpath export
 * because its dependency is an optional peer.
 */
export { OPENMINI_REACT_NATIVE_VERSION } from "./version.js";

export { MiniAppProvider, type MiniAppProviderProps } from "./api/provider.js";
export {
  MiniAppView,
  type MiniAppError,
  type MiniAppViewProps,
} from "./api/mini-app-view.js";
export { memoryKvStorage } from "./adapters/memory-storage.js";
export { parseAppManifest, type AppManifest } from "./domain/app-manifest.js";

export {
  createBridgeHost,
  type BridgeHost,
  type BridgeHostAdapters,
  type BridgeHostOptions,
  type HostApiHandler,
  type HostManifest,
} from "./usecases/bridge-host.js";
export { HostApiError } from "./domain/host-errors.js";
export {
  defineHostApi,
  normalizeCustomApis,
  type AnyHostApiDefinition,
  type CustomApis,
  type HostApiDefinition,
} from "./usecases/define-host-api.js";
export {
  hostEventForAppState,
  type HostLifecycleEvent,
} from "./domain/app-state.js";
export type { KvStorage } from "./ports/kv-storage.js";
export { rnSystemInfo } from "./adapters/native/system-info.js";
export { bindAppStateEvents } from "./adapters/native/app-state-events.js";

export {
  resolvePackage,
  type ResolveOptions,
  type ResolvedPackage,
} from "./usecases/resolve-package.js";
export { ResolverError, type ResolverErrorCode } from "./domain/errors.js";
export {
  parseRegistryIndex,
  resolveRef,
  type RegistryIndex,
  type RegistryVersionEntry,
} from "./domain/registry-index.js";
export type { HttpClient } from "./ports/http.js";
export type { FileStore } from "./ports/file-store.js";
export type { Hasher } from "./ports/hasher.js";
export { fetchHttpClient } from "./adapters/fetch-http.js";
export type { BootContext } from "./domain/boot.js";
export { buildBootstrapScript } from "./adapters/native/bootstrap.js";
export {
  OpenMiniWebView,
  type OpenMiniWebViewHandle,
  type OpenMiniWebViewProps,
} from "./adapters/native/webview.js";
export {
  nativeCacheDir,
  nativeFileStore,
  nativeHasher,
} from "./adapters/native/files.js";
