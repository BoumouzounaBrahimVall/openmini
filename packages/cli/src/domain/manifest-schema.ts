/**
 * Canonical manifest JSON Schema — a copy of the fenced schema
 * in specs/manifest.md. The spec is the source of truth; the sync is ENFORCED
 * by manifest-schema.spec-sync.test.ts (drift fails CI). Decision #11: JSON
 * Schema so non-TS implementations validate identically. $schema key omitted:
 * ajv validates the keywords directly.
 */
export const MANIFEST_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["manifestVersion", "id", "name", "version", "runtimeVersion"],
  properties: {
    manifestVersion: { const: 1 },
    id: {
      type: "string",
      pattern: "^[a-z0-9]+(\\.[a-z0-9-]+)+$",
      maxLength: 128,
    },
    name: { type: "string", minLength: 1, maxLength: 64 },
    version: {
      type: "string",
      pattern: "^\\d+\\.\\d+\\.\\d+(-[0-9A-Za-z-.]+)?$",
    },
    runtimeVersion: { type: "string", minLength: 1 },
    entry: { type: "string", pattern: "^[^/].*", default: "index.html" },
    permissions: {
      type: "array",
      uniqueItems: true,
      items: {
        anyOf: [
          { enum: ["storage", "network", "toast"] },
          { type: "string", pattern: "^host:[a-zA-Z][a-zA-Z0-9_-]*$" },
        ],
      },
      default: [],
    },
    allowedDomains: {
      type: "array",
      uniqueItems: true,
      items: {
        type: "string",
        pattern: "^https://[^/]+$|^http://(localhost|127\\.0\\.0\\.1)(:\\d+)?$",
      },
      default: [],
    },
    description: { type: "string", maxLength: 256 },
    icon: { type: "string", pattern: "^[^/].*" },
  },
} as const;

export interface Manifest {
  manifestVersion: 1;
  id: string;
  name: string;
  version: string;
  runtimeVersion: string;
  entry?: string;
  permissions?: string[];
  allowedDomains?: string[];
  description?: string;
  icon?: string;
}
