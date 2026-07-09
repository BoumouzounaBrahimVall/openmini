import { describe, expect, it } from "vitest";
import type { Clock } from "../ports/clock.js";
import type { Transport } from "../ports/transport.js";
import { BridgeError } from "../domain/errors.js";
import { BridgeClient } from "./bridge-client.js";

/** Transport with manual host-side control. */
function fakeTransport() {
  const sent: Record<string, unknown>[] = [];
  let deliver: (raw: string) => void = () => {};
  const transport: Transport = {
    send: (raw) => sent.push(JSON.parse(raw) as Record<string, unknown>),
    onMessage: (cb) => {
      deliver = cb;
    },
  };
  return {
    transport,
    sent,
    reply: (msg: unknown) => deliver(JSON.stringify(msg)),
    raw: (s: string) => deliver(s),
  };
}

/** Deterministic clock: timers fire only when advance() passes their deadline. */
function fakeClock() {
  let now = 0;
  let seq = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const clock: Clock = {
    setTimeout: (fn, ms) => {
      timers.set(++seq, { at: now + ms, fn });
      return seq;
    },
    clearTimeout: (h) => {
      timers.delete(h as number);
    },
  };
  return {
    clock,
    advance(ms: number) {
      now += ms;
      for (const [id, t] of [...timers]) {
        if (t.at <= now) {
          timers.delete(id);
          t.fn();
        }
      }
    },
  };
}

function setup(defaultTimeoutMs = 10_000) {
  const t = fakeTransport();
  const c = fakeClock();
  const client = new BridgeClient(t.transport, c.clock, defaultTimeoutMs);
  return { ...t, ...c, client };
}

describe("BridgeClient", () => {
  it("sends a spec envelope and resolves with the result", async () => {
    const { client, sent, reply } = setup();
    const promise = client.call("storage.get", { key: "k" });
    expect(sent[0]).toEqual({
      v: 1,
      type: "bridge.call",
      id: "c-1",
      api: "storage.get",
      payload: { key: "k" },
    });
    reply({
      v: 1,
      type: "bridge.result",
      id: "c-1",
      ok: true,
      result: { value: "v" },
    });
    await expect(promise).resolves.toEqual({ value: "v" });
  });

  it("rejects with a typed BridgeError carrying the host's code", async () => {
    const { client, reply } = setup();
    const promise = client.call("storage.set", {});
    reply({
      v: 1,
      type: "bridge.result",
      id: "c-1",
      ok: false,
      error: { code: "INVALID_PAYLOAD", message: "bad" },
    });
    await expect(promise).rejects.toMatchObject({
      name: "BridgeError",
      code: "INVALID_PAYLOAD",
      message: "bad",
    });
  });

  it("times out with TIMEOUT and drops the late result", async () => {
    const { client, reply, advance } = setup(500);
    const promise = client.call("system.getInfo", {});
    advance(500);
    await expect(promise).rejects.toMatchObject({ code: "TIMEOUT" });
    // late reply must be silently ignored (spec §3)
    expect(() =>
      reply({ v: 1, type: "bridge.result", id: "c-1", ok: true, result: null }),
    ).not.toThrow();
  });

  it("per-call timeout overrides the default", async () => {
    const { client, advance } = setup(10_000);
    const promise = client.call("system.getInfo", {}, { timeoutMs: 100 });
    advance(100);
    await expect(promise).rejects.toBeInstanceOf(BridgeError);
  });

  it("correlates out-of-order replies across concurrent calls", async () => {
    const { client, reply } = setup();
    const first = client.call("storage.get", { key: "a" });
    const second = client.call("storage.get", { key: "b" });
    reply({
      v: 1,
      type: "bridge.result",
      id: "c-2",
      ok: true,
      result: { value: "B" },
    });
    reply({
      v: 1,
      type: "bridge.result",
      id: "c-1",
      ok: true,
      result: { value: "A" },
    });
    await expect(second).resolves.toEqual({ value: "B" });
    await expect(first).resolves.toEqual({ value: "A" });
  });

  it("a settled call's timer is cleared (no ghost timeout)", async () => {
    const { client, reply, advance } = setup(500);
    const promise = client.call("navigation.close", {});
    reply({ v: 1, type: "bridge.result", id: "c-1", ok: true, result: null });
    await expect(promise).resolves.toBeNull();
    advance(1000); // must not throw/reject anything
  });

  it("dispatches host events to subscribers; unsubscribe works", () => {
    const { client, reply } = setup();
    const seen: unknown[] = [];
    const off = client.on("app.show", (p) => seen.push(p));
    reply({ v: 1, type: "host.event", event: "app.show", payload: {} });
    off();
    reply({ v: 1, type: "host.event", event: "app.show", payload: {} });
    expect(seen).toEqual([{}]);
  });

  it("ignores malformed messages, unknown types, and unknown ids", async () => {
    const { client, raw, reply } = setup();
    raw("not json");
    raw(JSON.stringify({ v: 1, type: "bogus.type" }));
    reply({
      v: 1,
      type: "bridge.result",
      id: "never-sent",
      ok: true,
      result: null,
    });
    const promise = client.call("system.getInfo", {});
    reply({ v: 1, type: "bridge.result", id: "c-1", ok: true, result: null });
    await expect(promise).resolves.toBeNull();
  });

  it("rejects with HOST_ERROR when the error object is malformed", async () => {
    const { client, reply } = setup();
    const promise = client.call("storage.get", { key: "k" });
    reply({ v: 1, type: "bridge.result", id: "c-1", ok: false });
    await expect(promise).rejects.toMatchObject({ code: "HOST_ERROR" });
  });
});

describe("BridgeClient transport failures", () => {
  it("cleans up and rejects with HOST_ERROR when send throws synchronously", async () => {
    const c = fakeClock();
    const throwing: Transport = {
      send: () => {
        throw new Error("bridge not ready");
      },
      onMessage: () => {},
    };
    const client = new BridgeClient(throwing, c.clock, 500);
    await expect(
      client.call("storage.get", { key: "k" }),
    ).rejects.toMatchObject({
      name: "BridgeError",
      code: "HOST_ERROR",
    });
    c.advance(1000); // timer must be gone: no ghost rejection/throw
  });
});
