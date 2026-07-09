// @vitest-environment jsdom
/**
 * The browser dev host must pass the SAME suite as every other host.
 * Network fixtures hit a real local echo server per the conformance
 * convention (README: GET /echo -> 200 {"ok":true}, anything else -> 404).
 */
import { createServer, type Server } from "node:http";
import {
  runConformance,
  type ConformanceAdapter,
  type SessionManifest,
} from "@openmini/conformance";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDevHost } from "./browser-host.js";

let server: Server;
let allowedOrigin: string;
let sessionCounter = 0;

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === "/echo") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end('{"ok":true}');
      return;
    }
    res.writeHead(404);
    res.end("");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string")
    throw new Error("no port");
  allowedOrigin = `http://127.0.0.1:${address.port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

function browserHostAdapter(): ConformanceAdapter {
  return {
    name: "browser-dev-host",
    openSession(manifest: SessionManifest) {
      const host = createDevHost({
        appId: `conf-${++sessionCounter}`, // fresh storage namespace per session
        manifest,
        customApis: { conformanceEcho: (payload) => payload ?? null },
      });
      return {
        send: (raw) => host.transport.send(raw),
        onMessage: (cb) => host.transport.onMessage(cb),
        triggerEvent: (event) => host.emitEvent(event),
        capabilities: ["customApis"],
        close: () => {},
      };
    },
  };
}

describe("browser dev host conformance", () => {
  it("passes the full suite, nothing skipped", async () => {
    const report = await runConformance(browserHostAdapter(), {
      placeholders: {
        ALLOWED_ORIGIN: allowedOrigin,
        BLOCKED_ORIGIN: "https://blocked.test",
      },
    });
    expect(report.failures).toEqual([]);
    expect(report.failed).toBe(0);
    expect(report.skipped).toBe(0);
    expect(report.passed).toBeGreaterThanOrEqual(21);
  });

  it("shows and removes a DOM toast", async () => {
    // clear toasts left by the conformance suite run (3s default duration)
    for (const el of document.querySelectorAll("[data-openmini-toast]"))
      el.remove();
    const host = createDevHost({
      appId: "toast-app",
      manifest: { permissions: ["toast"], allowedDomains: [] },
    });
    host.transport.onMessage(() => {});
    host.transport.send(
      JSON.stringify({
        v: 1,
        type: "bridge.call",
        id: "t1",
        api: "ui.showToast",
        payload: { message: "hi", durationMs: 5 },
      }),
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(document.querySelector("[data-openmini-toast]")?.textContent).toBe(
      "hi",
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(document.querySelector("[data-openmini-toast]")).toBeNull();
  });

  it("isolates storage between app ids", async () => {
    const make = (appId: string) => {
      const host = createDevHost({
        appId,
        manifest: { permissions: ["storage"], allowedDomains: [] },
      });
      const replies: string[] = [];
      host.transport.onMessage((raw) => replies.push(raw));
      return { host, replies };
    };
    const a = make("app-a");
    const b = make("app-b");
    a.host.transport.send(
      JSON.stringify({
        v: 1,
        type: "bridge.call",
        id: "1",
        api: "storage.set",
        payload: { key: "k", value: "va" },
      }),
    );
    await new Promise((r) => setTimeout(r, 0));
    b.host.transport.send(
      JSON.stringify({
        v: 1,
        type: "bridge.call",
        id: "2",
        api: "storage.get",
        payload: { key: "k" },
      }),
    );
    await new Promise((r) => setTimeout(r, 0));
    const last = JSON.parse(b.replies.at(-1) ?? "{}") as {
      result?: { value: string | null };
    };
    expect(last.result?.value).toBeNull();
  });
});
