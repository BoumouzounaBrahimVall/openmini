/**
 * Reference in-memory host. Implements `specs/bridge-protocol.md` exactly and
 * must pass the full suite — it doubles as readable documentation for anyone
 * writing a real host adapter. "Networking" is faked deterministically per the
 * echo convention in README.md, so no server is needed.
 */
import type {
  ConformanceAdapter,
  ConformanceSession,
  HostEventName,
  SessionManifest,
} from "./types.js";

type Msg = Record<string, unknown>;

const PERMISSION_BY_API: Record<string, string | undefined> = {
  "storage.get": "storage",
  "storage.set": "storage",
  "storage.remove": "storage",
  "ui.showToast": "toast",
  "network.request": "network",
  "system.getInfo": undefined,
  "navigation.close": undefined,
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

class MockSession implements ConformanceSession {
  private cb: ((raw: string) => void) | null = null;
  private storage = new Map<string, string>();

  constructor(
    private readonly manifest: SessionManifest,
    private readonly allowedOrigin: string,
  ) {}

  onMessage(cb: (raw: string) => void): void {
    this.cb = cb;
  }

  readonly capabilities = ["customApis"];

  triggerEvent(event: HostEventName): void {
    this.emit({ v: 1, type: "host.event", event, payload: {} });
  }

  close(): void {
    this.cb = null;
  }

  send(raw: string): void {
    let msg: unknown;
    try {
      msg = JSON.parse(raw);
    } catch {
      return; // malformed: drop, per spec
    }
    if (!isRecord(msg) || msg["type"] !== "bridge.call") return; // unknown type: ignore
    const { id, api, payload } = msg;
    if (typeof id !== "string" || typeof api !== "string") return;
    this.emit(this.handle(id, api, payload));
  }

  private handle(id: string, api: string, payload: unknown): Msg {
    // host.* passthrough (bridge-protocol §5.1): permission first, then registration.
    if (api.startsWith("host.")) {
      const name = api.slice("host.".length);
      if (!this.manifest.permissions.includes(`host:${name}`)) {
        return this.err(
          id,
          "PERMISSION_DENIED",
          `host:${name} permission not declared`,
        );
      }
      if (name === "conformanceEcho") return this.ok(id, payload ?? null);
      return this.err(
        id,
        "API_NOT_FOUND",
        `host api ${name} is not registered`,
      );
    }
    if (!(api in PERMISSION_BY_API))
      return this.err(id, "API_NOT_FOUND", `${api} is not implemented`);
    const permission = PERMISSION_BY_API[api];
    if (
      permission !== undefined &&
      !this.manifest.permissions.includes(permission)
    ) {
      return this.err(
        id,
        "PERMISSION_DENIED",
        `${permission} permission not declared`,
      );
    }
    const p = isRecord(payload) ? payload : {};
    switch (api) {
      case "storage.get": {
        if (typeof p["key"] !== "string")
          return this.err(id, "INVALID_PAYLOAD", "key must be a string");
        return this.ok(id, { value: this.storage.get(p["key"]) ?? null });
      }
      case "storage.set": {
        if (typeof p["key"] !== "string" || typeof p["value"] !== "string") {
          return this.err(
            id,
            "INVALID_PAYLOAD",
            "key and value must be strings",
          );
        }
        this.storage.set(p["key"], p["value"]);
        return this.ok(id, null);
      }
      case "storage.remove": {
        if (typeof p["key"] !== "string")
          return this.err(id, "INVALID_PAYLOAD", "key must be a string");
        this.storage.delete(p["key"]);
        return this.ok(id, null);
      }
      case "ui.showToast": {
        if (typeof p["message"] !== "string")
          return this.err(id, "INVALID_PAYLOAD", "message must be a string");
        return this.ok(id, null);
      }
      case "system.getInfo":
        return this.ok(id, {
          platform: "web",
          osVersion: "mock",
          hostSdkVersion: "0.0.0",
          bridgeVersion: 1,
          locale: "en-US",
          theme: "light",
          screen: { width: 390, height: 844, scale: 2 },
          safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
        });
      case "navigation.close":
        return this.ok(id, null);
      case "network.request": {
        if (typeof p["url"] !== "string")
          return this.err(id, "INVALID_PAYLOAD", "url must be a string");
        let origin: string;
        let pathname: string;
        try {
          const url = new URL(p["url"]);
          origin = url.origin;
          pathname = url.pathname;
        } catch {
          return this.err(id, "INVALID_PAYLOAD", "url is not a valid URL");
        }
        if (!this.manifest.allowedDomains.includes(origin)) {
          return this.err(
            id,
            "NETWORK_DOMAIN_BLOCKED",
            `${origin} is not in allowedDomains`,
          );
        }
        // Fake internet, per the conformance echo convention:
        if (origin === this.allowedOrigin && pathname === "/echo") {
          return this.ok(id, {
            status: 200,
            headers: { "content-type": "application/json" },
            body: '{"ok":true}',
          });
        }
        return this.ok(id, { status: 404, headers: {}, body: "" });
      }
      default:
        return this.err(id, "API_NOT_FOUND", api);
    }
  }

  private ok(id: string, result: unknown): Msg {
    return { v: 1, type: "bridge.result", id, ok: true, result };
  }
  private err(id: string, code: string, message: string): Msg {
    return {
      v: 1,
      type: "bridge.result",
      id,
      ok: false,
      error: { code, message },
    };
  }
  private emit(msg: Msg): void {
    this.cb?.(JSON.stringify(msg));
  }
}

export class MockHostAdapter implements ConformanceAdapter {
  readonly name = "mock-host";
  constructor(private readonly allowedOrigin = "https://allowed.test") {}
  openSession(manifest: SessionManifest): ConformanceSession {
    return new MockSession(manifest, this.allowedOrigin);
  }
}
