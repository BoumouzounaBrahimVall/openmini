import Ajv from "ajv";
import { MANIFEST_SCHEMA, type Manifest } from "../domain/manifest-schema.js";

const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });
const compiled = ajv.compile(MANIFEST_SCHEMA);

export type ManifestValidation =
  { ok: true; manifest: Manifest } | { ok: false; errors: string[] };

export function validateManifest(value: unknown): ManifestValidation {
  if (compiled(value))
    return { ok: true, manifest: value as unknown as Manifest };
  const errors = (compiled.errors ?? []).map((e) => {
    const where =
      e.instancePath === ""
        ? "manifest"
        : `manifest${e.instancePath.replaceAll("/", ".")}`;
    return `${where} ${e.message ?? "is invalid"}`;
  });
  return { ok: false, errors };
}

export function parseManifest(source: string): ManifestValidation {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (cause) {
    return {
      ok: false,
      errors: [
        `manifest.json is not valid JSON: ${cause instanceof Error ? cause.message : ""}`,
      ],
    };
  }
  return validateManifest(value);
}
