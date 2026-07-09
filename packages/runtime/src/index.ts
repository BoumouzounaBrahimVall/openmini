/**
 * @openmini/runtime — mini-app-side SDK.
 *
 * Two ways in: `import { mini }` (lazy singleton over the host's global
 * binding — what mini-apps use) or `createMiniRuntime({ transport })`
 * (explicit composition — what bindings and tests use).
 * Hexagonal, zero runtime dependencies (specs/architecture.md).
 */
export {
  createMiniRuntime,
  type CreateMiniRuntimeOptions,
  type MiniRuntime,
} from "./create-runtime.js";
export {
  connectGlobalRuntime,
  mini,
  resetGlobalRuntime,
} from "./adapters/global-binding.js";

export const OPENMINI_RUNTIME_VERSION = "0.0.0";

export { BridgeClient } from "./usecases/bridge-client.js";
export { BridgeError } from "./domain/errors.js";
export {
  BRIDGE_VERSION,
  HOST_NAME_PATTERN,
  parseIncoming,
  type BridgeCall,
  type BridgeErrorShape,
  type BridgeResult,
  type ErrorCode,
  type HostEventMessage,
  type HostEventName,
} from "./domain/protocol.js";
export type { BootContext, Transport } from "./ports/transport.js";
export type { Clock } from "./ports/clock.js";
export type {
  Mini,
  NetworkRequestOptions,
  NetworkResponse,
  SystemInfo,
  ToastOptions,
  Unsubscribe,
} from "./api/mini.js";
