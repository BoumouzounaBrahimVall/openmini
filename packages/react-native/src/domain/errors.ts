export type ResolverErrorCode =
  | "APP_NOT_FOUND"
  | "REF_NOT_FOUND"
  | "INDEX_INVALID"
  | "FETCH_FAILED"
  | "HASH_MISMATCH"
  | "BAD_PACKAGE"
  | "RUNTIME_INCOMPATIBLE";

/** Every resolver failure is typed; hosts map these to onError payloads. */
export class ResolverError extends Error {
  override readonly name = "ResolverError";

  constructor(
    readonly code: ResolverErrorCode,
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
  }
}
