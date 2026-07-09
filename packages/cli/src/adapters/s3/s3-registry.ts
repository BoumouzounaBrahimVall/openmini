import type {
  RegistryTarget,
  RegistryWriteMeta,
} from "../../usecases/publish.js";

/**
 * Minimal client surface so the adapter is testable without the AWS SDK and
 * usable with any S3-compatible endpoint (MinIO, R2, …). The bin constructs
 * one lazily from @aws-sdk/client-s3 when given an s3:// registry.
 */
export interface S3LikeClient {
  putObject(args: {
    key: string;
    body: Uint8Array | string;
    contentType: string;
    cacheControl: string;
  }): Promise<void>;
  /** Returns null for missing keys. */
  getObjectText(key: string): Promise<string | null>;
}

export function s3RegistryTarget(
  client: S3LikeClient,
  prefix = "",
): RegistryTarget {
  const key = (path: string) =>
    prefix === "" ? path : `${prefix.replace(/\/$/, "")}/${path}`;
  const write = (
    path: string,
    body: Uint8Array | string,
    meta: RegistryWriteMeta,
  ) =>
    client.putObject({
      key: key(path),
      body,
      contentType: meta.contentType,
      cacheControl: meta.cacheControl,
    });
  return {
    readText: (path) => client.getObjectText(key(path)),
    writeBytes: write,
    // S3 PUT is atomic per object (specs/registry-protocol.md §4).
    writeTextAtomic: write,
  };
}
