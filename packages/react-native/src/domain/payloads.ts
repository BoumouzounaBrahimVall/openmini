/**
 * Host-side payload validation for the built-in APIs — Zod per roadmap
 * decision #11 (specs/architecture.md validation table). Custom `host.*`
 * payloads are deliberately NOT validated here: their shape is a host-app
 * contract (bridge-protocol §5.1).
 */
import { z } from "zod";
import { HostApiError } from "./host-errors.js";

export const storageKeyPayload = z.object({ key: z.string() });

export const storageSetPayload = z.object({
  key: z.string(),
  value: z.string(),
});

export const toastPayload = z.object({
  message: z.string(),
  durationMs: z.number().optional(),
});

export const networkRequestPayload = z.object({
  url: z.string(),
  method: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.string().optional(),
  timeoutMs: z.number().optional(),
});

/** Parse or throw the bridge-protocol INVALID_PAYLOAD error. */
export function parseWith<S extends z.ZodType>(
  schema: S,
  payload: unknown,
): z.output<S> {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new HostApiError(
      "INVALID_PAYLOAD",
      parsed.error.issues
        .map((i) => `${i.path.join(".") || "payload"}: ${i.message}`)
        .join("; "),
    );
  }
  return parsed.data;
}
