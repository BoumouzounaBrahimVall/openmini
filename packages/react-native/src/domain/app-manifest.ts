/**
 * Host-side read of a VERIFIED package's manifest.json (specs/manifest.md).
 * Only the fields the host needs; full schema validation happened at pack
 * time (cli, ajv) — this guards against a registry serving garbage. Zod per
 * decision #11.
 */
import { z } from "zod";
import { ResolverError } from "./errors.js";

const appManifestSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  entry: z.string().default("index.html"),
  // Deny-by-default: an absent list grants nothing.
  permissions: z.array(z.string()).default([]),
  allowedDomains: z.array(z.string()).default([]),
});

export type AppManifest = z.infer<typeof appManifestSchema>;

export function parseAppManifest(
  text: string | null,
  label: string,
): AppManifest {
  if (text === null) {
    throw new ResolverError(
      "BAD_PACKAGE",
      `${label}: manifest.json missing from extracted package`,
    );
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ResolverError(
      "BAD_PACKAGE",
      `${label}: manifest.json is not valid JSON`,
    );
  }
  const parsed = appManifestSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ResolverError(
      "BAD_PACKAGE",
      `${label}: manifest.json invalid: ${parsed.error.issues
        .map((i) => `${i.path.join(".") || "manifest"}: ${i.message}`)
        .join("; ")}`,
    );
  }
  return parsed.data;
}
