/**
 * @openmini/cli — developer tooling.
 *
 * All commands shipped: `create`, `dev`, `build`, `pack`, `inspect`,
 * `publish`. The browser dev host lives
 * here because `mini dev` injects it.
 */
export const OPENMINI_CLI_VERSION = "0.0.0";

export {
  createDevHost,
  type DevHost,
  type DevHostOptions,
} from "./dev-host/browser-host.js";
export { wireDevGlobals, type DevBoot } from "./dev-host/globals.js";
export {
  createHostRouter,
  HostApiError,
  type BuiltinApi,
  type HostApiHandler,
  type HostManifest,
  type HostRouterOptions,
} from "./dev-host/router.js";
export { MANIFEST_SCHEMA, type Manifest } from "./domain/manifest-schema.js";
export {
  parseManifest,
  validateManifest,
  type ManifestValidation,
} from "./usecases/validate-manifest.js";
export {
  CliError,
  createApp,
  type CreateAppOptions,
  type FileSystemPort,
} from "./usecases/create-app.js";
export { loadManifest } from "./usecases/dev.js";
export { buildCsp, injectCsp, type CspInjection } from "./domain/csp.js";
export {
  packApp,
  sha256,
  type PackOptions,
  type PackResult,
} from "./usecases/pack.js";
export {
  assertValidPackage,
  inspectPackage,
  type InspectResult,
  type InspectSummary,
} from "./usecases/inspect.js";
export { buildApp, WEB_OUT_DIR } from "./adapters/vite/build.js";
export {
  readDirBytes,
  resolveRuntimeVersion,
} from "./adapters/node/package-io.js";
export {
  createDevServer,
  startDevServer,
  type DevServerOptions,
} from "./adapters/vite/dev-server.js";
export { openminiDevPlugin } from "./adapters/vite/openmini-plugin.js";
export {
  publishPackage,
  type PublishOptions,
  type PublishResult,
  type RegistryTarget,
  type RegistryWriteMeta,
} from "./usecases/publish.js";
export { fsRegistryTarget } from "./adapters/node/fs-registry.js";
export {
  s3RegistryTarget,
  type S3LikeClient,
} from "./adapters/s3/s3-registry.js";
export {
  REGISTRY_VERSION,
  type RegistryIndex,
  type RegistryVersionEntry,
} from "./domain/registry.js";
