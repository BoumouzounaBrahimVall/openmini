import type { ErrorCode } from "@openmini/runtime";

/** Thrown by host API handlers to reach the mini-app as a typed bridge error. */
export class HostApiError extends Error {
  override readonly name = "HostApiError";

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}
