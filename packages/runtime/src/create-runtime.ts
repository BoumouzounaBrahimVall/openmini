import { buildMini, type Mini } from "./api/mini.js";
import { systemClock, type Clock } from "./ports/clock.js";
import type { BootContext, Transport } from "./ports/transport.js";
import { BridgeClient } from "./usecases/bridge-client.js";

export interface CreateMiniRuntimeOptions {
  transport: Transport;
  bootContext?: BootContext;
  /** Default per-call timeout; spec default is 10 000 ms. */
  defaultTimeoutMs?: number;
  clock?: Clock;
}

export interface MiniRuntime {
  mini: Mini;
  client: BridgeClient;
}

export function createMiniRuntime(
  options: CreateMiniRuntimeOptions,
): MiniRuntime {
  const client = new BridgeClient(
    options.transport,
    options.clock ?? systemClock,
    options.defaultTimeoutMs ?? 10_000,
  );
  const mini = buildMini(client, options.bootContext);
  return { mini, client };
}
