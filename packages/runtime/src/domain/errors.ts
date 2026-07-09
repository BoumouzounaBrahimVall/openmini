import type { ErrorCode } from "./protocol.js";

/** Every rejected `mini.*` promise rejects with a BridgeError. */
export class BridgeError extends Error {
  override readonly name = "BridgeError";

  constructor(
    readonly code: ErrorCode | (string & {}),
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}
