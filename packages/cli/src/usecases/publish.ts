import { REGISTRY_VERSION, type RegistryIndex } from "../domain/registry.js";
import { CliError } from "./create-app.js";
import { assertValidPackage } from "./inspect.js";

export interface RegistryWriteMeta {
  contentType: string;
  /** Serving guidance from specs/registry-protocol.md §5. */
  cacheControl: string;
}

/** Outbound port: anything that can store the static registry layout. */
export interface RegistryTarget {
  /** Returns null when the path does not exist. */
  readText(path: string): Promise<string | null>;
  writeBytes(
    path: string,
    bytes: Uint8Array,
    meta: RegistryWriteMeta,
  ): Promise<void>;
  /** MUST be an atomic replace (fs: temp+rename; S3: PUT is atomic per object). */
  writeTextAtomic(
    path: string,
    text: string,
    meta: RegistryWriteMeta,
  ): Promise<void>;
}

export interface PublishOptions {
  bytes: Uint8Array;
  target: RegistryTarget;
  /** Replaces an existing version (dev registries only — versions are immutable). */
  force?: boolean;
  now: Date;
}

export interface PublishResult {
  index: RegistryIndex;
  packagePath: string;
  indexPath: string;
}

const INDEX_META: RegistryWriteMeta = {
  contentType: "application/json",
  cacheControl: "no-cache",
};
const PACKAGE_META: RegistryWriteMeta = {
  contentType: "application/zip",
  cacheControl: "public, max-age=31536000, immutable",
};

/**
 * Publishes an .mpkg per specs/registry-protocol.md §4: validate, write the
 * package FIRST, then atomically replace index.json — readers never observe
 * an index referencing a missing package.
 */
export async function publishPackage(
  options: PublishOptions,
): Promise<PublishResult> {
  const summary = assertValidPackage(options.bytes);
  const indexPath = `${summary.id}/index.json`;
  const packagePath = `${summary.id}/${summary.version}/app.mpkg`;

  const existingText = await options.target.readText(indexPath);
  let index: RegistryIndex;
  if (existingText === null) {
    index = {
      registryVersion: REGISTRY_VERSION,
      id: summary.id,
      name: summary.name,
      latest: summary.version,
      versions: {},
    };
  } else {
    index = JSON.parse(existingText) as RegistryIndex;
    if (index.registryVersion !== REGISTRY_VERSION) {
      throw new CliError(
        `registry index has unsupported registryVersion ${String(index.registryVersion)}`,
      );
    }
    if (index.id !== summary.id) {
      throw new CliError(
        `registry index id ${index.id} does not match package id ${summary.id}`,
      );
    }
    if (summary.version in index.versions && options.force !== true) {
      throw new CliError(
        `version ${summary.version} is already published — versions are immutable (use --force only on dev registries)`,
      );
    }
  }

  await options.target.writeBytes(packagePath, options.bytes, PACKAGE_META);

  const updated: RegistryIndex = {
    ...index,
    name: summary.name,
    latest: summary.version, // v1: publishing points `latest` at the new version; rollback = repoint
    versions: {
      ...index.versions,
      [summary.version]: {
        package: `${summary.version}/app.mpkg`,
        sha256: summary.packageSha256,
        size: summary.byteSize,
        runtimeVersion: summary.runtimeVersion,
        publishedAt: options.now.toISOString(),
      },
    },
  };
  await options.target.writeTextAtomic(
    indexPath,
    `${JSON.stringify(updated, null, 2)}\n`,
    INDEX_META,
  );
  return { index: updated, packagePath, indexPath };
}
