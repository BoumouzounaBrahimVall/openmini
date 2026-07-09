/**
 * Bridge protocol v1 — types and message parsing, straight from
 * `specs/bridge-protocol.md`. Pure domain: no platform APIs, no ports.
 */

export const BRIDGE_VERSION = 1;

export type ErrorCode =
  | "PERMISSION_DENIED"
  | "API_NOT_FOUND"
  | "INVALID_PAYLOAD"
  | "NETWORK_DOMAIN_BLOCKED"
  | "HOST_ERROR"
  | "TIMEOUT";

export type HostEventName = "app.show" | "app.hide" | "app.destroy";

export interface BridgeCall {
  v: typeof BRIDGE_VERSION;
  type: "bridge.call";
  id: string;
  api: string;
  payload: unknown;
}

export interface BridgeErrorShape {
  code: ErrorCode | (string & {});
  message: string;
  details?: unknown;
}

export interface BridgeResult {
  type: "bridge.result";
  id: string;
  ok: boolean;
  result?: unknown;
  error?: BridgeErrorShape;
}

export interface HostEventMessage {
  type: "host.event";
  event: string;
  payload: unknown;
}

/** Grammar for host-defined API/event names (bridge-protocol §5.1). */
export const HOST_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Parses an incoming raw message. Returns null for anything the spec says to
 * ignore: malformed JSON, non-objects, unknown `type`, missing fields.
 *
 * `v` is deliberately NOT checked: the spec (§2) says unknown fields are
 * ignored and forward compatibility is by `type` — a future incompatible
 * envelope must change `type`, not just bump `v`.
 */
export function parseIncoming(
  raw: string,
): BridgeResult | HostEventMessage | null {
  let msg: unknown;
  try {
    msg = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(msg)) return null;
  if (
    msg["type"] === "bridge.result" &&
    typeof msg["id"] === "string" &&
    typeof msg["ok"] === "boolean"
  ) {
    const error = isRecord(msg["error"])
      ? {
          code:
            typeof msg["error"]["code"] === "string"
              ? msg["error"]["code"]
              : "HOST_ERROR",
          message:
            typeof msg["error"]["message"] === "string"
              ? msg["error"]["message"]
              : "unknown host error",
          details: msg["error"]["details"],
        }
      : undefined;
    return {
      type: "bridge.result",
      id: msg["id"],
      ok: msg["ok"],
      result: msg["result"],
      error,
    };
  }
  if (msg["type"] === "host.event" && typeof msg["event"] === "string") {
    return {
      type: "host.event",
      event: msg["event"],
      payload: msg["payload"] ?? {},
    };
  }
  return null;
}
