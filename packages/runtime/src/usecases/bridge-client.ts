import { BridgeError } from "../domain/errors.js";
import { BRIDGE_VERSION, parseIncoming } from "../domain/protocol.js";
import type { Clock } from "../ports/clock.js";
import type { Transport } from "../ports/transport.js";

interface PendingCall {
  resolve(value: unknown): void;
  reject(error: BridgeError): void;
  timer: unknown;
}

/**
 * Call correlation, timeouts, and host-event dispatch over an injected
 * Transport (bridge-protocol §2–§4). Knows nothing about WebView, RN, or
 * the browser — that's the hexagonal boundary.
 */
export class BridgeClient {
  private readonly pending = new Map<string, PendingCall>();
  private readonly listeners = new Map<
    string,
    Set<(payload: unknown) => void>
  >();
  private counter = 0;
  private static readonly CALL_ID_PREFIX = "c-";

  constructor(
    private readonly transport: Transport,
    private readonly clock: Clock,
    private readonly defaultTimeoutMs: number,
  ) {
    transport.onMessage((raw) => this.handleMessage(raw));
  }

  call(
    api: string,
    payload: unknown,
    opts?: { timeoutMs?: number },
  ): Promise<unknown> {
    const id = `${BridgeClient.CALL_ID_PREFIX}${++this.counter}`;
    const timeoutMs = opts?.timeoutMs ?? this.defaultTimeoutMs;
    return new Promise((resolve, reject) => {
      const timer = this.clock.setTimeout(() => {
        // Late results for this id are silently dropped (spec §3).
        this.pending.delete(id);
        reject(
          new BridgeError("TIMEOUT", `${api} timed out after ${timeoutMs}ms`),
        );
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.transport.send(
          JSON.stringify({
            v: BRIDGE_VERSION,
            type: "bridge.call",
            id,
            api,
            payload,
          }),
        );
      } catch (err) {
        this.pending.delete(id);
        this.clock.clearTimeout(timer);
        reject(
          new BridgeError("HOST_ERROR", `transport failed to send ${api}`, err),
        );
      }
    });
  }

  /** Subscribe to a host event by full name (e.g. "app.show", "host.cartUpdated"). */
  on(event: string, cb: (payload: unknown) => void): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(cb);
    return () => {
      set.delete(cb);
    };
  }

  private handleMessage(raw: string): void {
    const msg = parseIncoming(raw);
    if (msg === null) return;
    if (msg.type === "bridge.result") {
      const call = this.pending.get(msg.id);
      if (!call) return; // late or unknown id: drop (spec §3)
      this.pending.delete(msg.id);
      this.clock.clearTimeout(call.timer);
      if (msg.ok) {
        call.resolve(msg.result ?? null);
      } else {
        call.reject(
          new BridgeError(
            msg.error?.code ?? "HOST_ERROR",
            msg.error?.message ?? "unknown host error",
            msg.error?.details,
          ),
        );
      }
      return;
    }
    const set = this.listeners.get(msg.event);
    if (!set) return;
    for (const cb of [...set]) cb(msg.payload);
  }
}
