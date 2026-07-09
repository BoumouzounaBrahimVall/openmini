/**
 * The browser mock host: implements the host side of the bridge inside a
 * plain browser page so `mini dev` needs no mobile tooling.
 * Also the reference host implementation future host authors read.
 */
import { BRIDGE_VERSION, type Transport } from "@openmini/runtime";
import {
  createHostRouter,
  HostApiError,
  type HostApiHandler,
  type HostManifest,
} from "./router.js";

export interface DevHostOptions {
  appId: string;
  manifest: HostManifest;
  /** Host-defined APIs (bridge-protocol §5.1), keyed by bare name. */
  customApis?: Record<string, HostApiHandler>;
  /** Dev affordance: log every bridge call/result/event (console.debug). */
  debug?: boolean;
}

export interface DevHost {
  /** What the mini-app runtime consumes (`createMiniRuntime({ transport })`). */
  transport: Transport;
  /** Push a host event (e.g. "app.show", "host.cartUpdated") to the mini-app. */
  emitEvent(event: string, payload?: unknown): void;
}

function requireString(payload: unknown, key: string): string {
  const value = (payload as Record<string, unknown> | null)?.[key];
  if (typeof value !== "string") {
    throw new HostApiError("INVALID_PAYLOAD", `${key} must be a string`);
  }
  return value;
}

function storageKey(appId: string, key: string): string {
  return `openmini:${appId}:${key}`;
}

function showToast(message: string, durationMs: number): void {
  const el = document.createElement("div");
  el.setAttribute("data-openmini-toast", "");
  el.textContent = message;
  el.style.cssText =
    "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);" +
    "background:rgba(0,0,0,.85);color:#fff;padding:10px 16px;border-radius:8px;" +
    "font:14px system-ui;z-index:2147483647;pointer-events:none";
  document.body.appendChild(el);
  setTimeout(() => el.remove(), durationMs);
}

async function networkRequest(
  payload: unknown,
  allowedDomains: string[],
): Promise<unknown> {
  const url = requireString(payload, "url");
  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    throw new HostApiError("INVALID_PAYLOAD", "url is not a valid URL");
  }
  if (!allowedDomains.includes(origin)) {
    throw new HostApiError(
      "NETWORK_DOMAIN_BLOCKED",
      `${origin} is not in allowedDomains`,
    );
  }
  const p = payload as {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    timeoutMs?: number;
  };
  const controller = new AbortController();
  const timer =
    p.timeoutMs !== undefined
      ? setTimeout(() => controller.abort(), p.timeoutMs)
      : undefined;
  try {
    const response = await fetch(url, {
      method: p.method ?? "GET",
      headers: p.headers,
      body: p.body,
      signal: controller.signal,
    });
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: await response.text(),
    };
  } catch (cause) {
    throw new HostApiError(
      "HOST_ERROR",
      cause instanceof Error ? cause.message : "network request failed",
    );
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function systemInfo(): unknown {
  const prefersDark =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  return {
    platform: "web",
    osVersion: navigator.userAgent,
    hostSdkVersion: "0.0.0",
    bridgeVersion: BRIDGE_VERSION,
    locale: navigator.language || "en-US",
    theme: prefersDark ? "dark" : "light",
    screen: {
      width: window.innerWidth,
      height: window.innerHeight,
      scale: window.devicePixelRatio || 1,
    },
    safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
  };
}

export function createDevHost(options: DevHostOptions): DevHost {
  const { appId, manifest, customApis, debug = false } = options;
  const log = debug
    ? (...args: unknown[]) => console.debug("[openmini:dev-host]", ...args)
    : () => {};
  let toMiniApp: (raw: string) => void = () => {};

  const route = createHostRouter({
    manifest,
    customApis,
    builtins: {
      "storage.get": {
        permission: "storage",
        handler: (p) => ({
          value: localStorage.getItem(
            storageKey(appId, requireString(p, "key")),
          ),
        }),
      },
      "storage.set": {
        permission: "storage",
        handler: (p) => {
          localStorage.setItem(
            storageKey(appId, requireString(p, "key")),
            requireString(p, "value"),
          );
          return null;
        },
      },
      "storage.remove": {
        permission: "storage",
        handler: (p) => {
          localStorage.removeItem(storageKey(appId, requireString(p, "key")));
          return null;
        },
      },
      "ui.showToast": {
        permission: "toast",
        handler: (p) => {
          const message = requireString(p, "message");
          const durationMs = (p as { durationMs?: unknown }).durationMs;
          showToast(
            message,
            typeof durationMs === "number" ? durationMs : 3000,
          );
          return null;
        },
      },
      "system.getInfo": { handler: () => systemInfo() },
      "navigation.close": {
        handler: () => {
          log("navigation.close requested");
          return null;
        },
      },
      "network.request": {
        permission: "network",
        handler: (p) => networkRequest(p, manifest.allowedDomains),
      },
    },
  });

  return {
    transport: {
      send(raw: string): void {
        let msg: unknown;
        try {
          msg = JSON.parse(raw);
        } catch {
          return; // malformed: drop, per spec
        }
        const call = msg as {
          type?: unknown;
          id?: unknown;
          api?: unknown;
          payload?: unknown;
        };
        if (
          call.type !== "bridge.call" ||
          typeof call.id !== "string" ||
          typeof call.api !== "string"
        )
          return;
        log("call", call.api, call.payload);
        void route({ id: call.id, api: call.api, payload: call.payload }).then(
          (result) => {
            log("result", call.api, result);
            toMiniApp(JSON.stringify({ v: BRIDGE_VERSION, ...result }));
          },
        );
      },
      onMessage(cb: (raw: string) => void): void {
        toMiniApp = cb;
      },
    },
    emitEvent(event: string, payload: unknown = {}): void {
      log("event", event, payload);
      toMiniApp(
        JSON.stringify({
          v: BRIDGE_VERSION,
          type: "host.event",
          event,
          payload,
        }),
      );
    },
  };
}

// Re-exported so the "@openmini/cli/dev-host" specifier (package exports +
// the vite plugin's self-resolution) serves the full boot surface.
export { wireDevGlobals, type DevBoot } from "./globals.js";
