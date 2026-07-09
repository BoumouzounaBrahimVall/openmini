/**
 * Portable core of the conformance harness: the matcher, the message inbox,
 * step execution, and `runSuite` over ALREADY-LOADED fixtures.
 *
 * This module is deliberately free of Node APIs and of runtime relative
 * imports (only type-only imports, erased at compile time), so it runs
 * anywhere a host lives: Node/vitest, a browser page, or inside a React
 * Native app bundled by Metro (the on-device driver). Filesystem
 * fixture loading stays in runner.ts.
 */
import type {
  CallStep,
  ConformanceAdapter,
  ConformanceSession,
  EventStep,
  Failure,
  FixtureFile,
  FixtureStep,
  RawStep,
  Report,
  SessionManifest,
} from "./types.js";

/* ---------- structural matcher ---------- */

type Token = (arg: unknown, actual: unknown) => string | null;

const TOKENS: Record<string, Token> = {
  $any: () => null,
  $type: (arg, actual) =>
    typeof actual === arg
      ? null
      : `expected typeof ${String(arg)}, got ${typeof actual}`,
  $enum: (arg, actual) =>
    Array.isArray(arg) && arg.some((v) => v === actual)
      ? null
      : `expected one of ${JSON.stringify(arg)}, got ${JSON.stringify(actual)}`,
};

/** Register an additional matcher token (e.g. `$regex`) from outside. */
export function registerToken(name: `$${string}`, fn: Token): void {
  TOKENS[name] = fn;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Returns null on match, or a human-readable mismatch message. */
export function match(
  expected: unknown,
  actual: unknown,
  path = "$",
): string | null {
  if (isRecord(expected)) {
    const keys = Object.keys(expected);
    const tokenKey =
      keys.length === 1 && keys[0] !== undefined && keys[0].startsWith("$")
        ? keys[0]
        : null;
    if (tokenKey !== null) {
      const token = TOKENS[tokenKey];
      if (!token) return `${path}: unknown matcher token ${tokenKey}`;
      const err = token(expected[tokenKey], actual);
      return err ? `${path}: ${err}` : null;
    }
    if (!isRecord(actual)) {
      return `${path}: expected object, got ${JSON.stringify(actual)}`;
    }
    for (const key of keys) {
      const err = match(expected[key], actual[key], `${path}.${key}`);
      if (err) return err;
    }
    return null;
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual))
      return `${path}: expected array, got ${JSON.stringify(actual)}`;
    if (actual.length !== expected.length)
      return `${path}: expected length ${expected.length}, got ${actual.length}`;
    for (let i = 0; i < expected.length; i++) {
      const err = match(expected[i], actual[i], `${path}[${i}]`);
      if (err) return err;
    }
    return null;
  }
  return Object.is(expected, actual)
    ? null
    : `${path}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;
}

/* ---------- placeholders ---------- */

export const DEFAULT_PLACEHOLDERS: Record<string, string> = {
  ALLOWED_ORIGIN: "https://allowed.test",
  BLOCKED_ORIGIN: "https://blocked.test",
};

/**
 * Substitute `{{NAME}}` placeholders in already-parsed fixtures (the
 * text-level equivalent lives in loadFixtures for the fs path). Returns new
 * fixture objects; the input is not mutated.
 */
export function applyPlaceholders(
  fixtures: FixtureFile[],
  placeholders: Record<string, string> = DEFAULT_PLACEHOLDERS,
): FixtureFile[] {
  return fixtures.map((fixture) => {
    let text = JSON.stringify(fixture);
    for (const [key, value] of Object.entries(placeholders)) {
      text = text.replaceAll(`{{${key}}}`, value);
    }
    return JSON.parse(text) as FixtureFile;
  });
}

/* ---------- message inbox with predicate waiting ---------- */

type Msg = Record<string, unknown>;

class Inbox {
  private queue: Msg[] = [];
  private waiters: {
    pred: (m: Msg) => boolean;
    resolve: (m: Msg) => void;
  }[] = [];

  push(raw: string): void {
    let msg: unknown;
    try {
      msg = JSON.parse(raw);
    } catch {
      return; // malformed messages are dropped, per spec
    }
    if (typeof msg !== "object" || msg === null) return;
    const m = msg as Msg;
    const idx = this.waiters.findIndex((w) => w.pred(m));
    if (idx >= 0) {
      const waiter = this.waiters[idx];
      this.waiters.splice(idx, 1);
      waiter?.resolve(m);
      return;
    }
    this.queue.push(m);
  }

  waitFor(
    pred: (m: Msg) => boolean,
    timeoutMs: number,
  ): Promise<Msg | undefined> {
    const idx = this.queue.findIndex(pred);
    if (idx >= 0) {
      const found = this.queue[idx];
      this.queue.splice(idx, 1);
      return Promise.resolve(found);
    }
    return new Promise((resolve) => {
      const waiter = {
        pred,
        resolve: (m: Msg) => {
          clearTimeout(timer);
          resolve(m);
        },
      };
      const timer = setTimeout(() => {
        const i = this.waiters.indexOf(waiter);
        if (i >= 0) this.waiters.splice(i, 1);
        resolve(undefined);
      }, timeoutMs);
      this.waiters.push(waiter);
    });
  }
}

/* ---------- step execution ---------- */

function isCallStep(s: FixtureStep): s is CallStep {
  return "call" in s;
}
function isEventStep(s: FixtureStep): s is EventStep {
  return "triggerEvent" in s;
}
function isRawStep(s: FixtureStep): s is RawStep {
  return "sendRaw" in s;
}

let callCounter = 0;

async function runCallStep(
  session: ConformanceSession,
  inbox: Inbox,
  step: CallStep,
  timeoutMs: number,
): Promise<string | null> {
  const id = `conf-${++callCounter}`;
  session.send(
    JSON.stringify({
      v: 1,
      type: "bridge.call",
      id,
      api: step.call.api,
      payload: step.call.payload,
    }),
  );
  const reply = await inbox.waitFor(
    (m) => m["type"] === "bridge.result" && m["id"] === id,
    timeoutMs,
  );
  if (!reply)
    return `no bridge.result for ${step.call.api} within ${timeoutMs}ms`;
  if (reply["ok"] !== step.expect.ok) {
    return `expected ok:${String(step.expect.ok)}, got ok:${JSON.stringify(reply["ok"])} (${JSON.stringify(reply["error"] ?? reply["result"])})`;
  }
  if (step.expect.ok) {
    return step.expect.result === undefined
      ? null
      : match(step.expect.result, reply["result"]);
  }
  const error = reply["error"];
  const code =
    typeof error === "object" && error !== null
      ? (error as Msg)["code"]
      : undefined;
  return code === step.expect.errorCode
    ? null
    : `expected error.code ${String(step.expect.errorCode)}, got ${JSON.stringify(code)}`;
}

async function runEventStep(
  session: ConformanceSession,
  inbox: Inbox,
  step: EventStep,
  timeoutMs: number,
): Promise<string | null> {
  await session.triggerEvent?.(step.triggerEvent);
  const evt = await inbox.waitFor(
    (m) => m["type"] === "host.event" && m["event"] === step.expectEvent.event,
    timeoutMs,
  );
  return evt
    ? null
    : `host.event ${step.expectEvent.event} not received within ${timeoutMs}ms`;
}

async function runRawStep(
  session: ConformanceSession,
  inbox: Inbox,
  step: RawStep,
  graceMs: number,
): Promise<string | null> {
  session.send(step.sendRaw);
  const reply = await inbox.waitFor(
    (m) => m["type"] === "bridge.result",
    graceMs,
  );
  return reply ? `expected no reply, got ${JSON.stringify(reply)}` : null;
}

/* ---------- suite runner over loaded fixtures ---------- */

export interface SuiteOptions {
  /** Per-reply timeout. Raise for slow transports (real devices). */
  timeoutMs?: number;
}

export async function runSuite(
  adapter: ConformanceAdapter,
  fixtures: FixtureFile[],
  opts: SuiteOptions = {},
): Promise<Report> {
  const timeoutMs = opts.timeoutMs ?? 2000;

  const report: Report = {
    adapter: adapter.name,
    passed: 0,
    failed: 0,
    skipped: 0,
    failures: [],
    skippedTests: [],
  };

  for (const fixture of fixtures) {
    if (
      fixture.conformanceVersion !== undefined &&
      fixture.conformanceVersion !== 1
    ) {
      throw new Error(
        `${fixture.name}: unsupported conformanceVersion ${String(fixture.conformanceVersion)}`,
      );
    }
    for (const test of fixture.tests) {
      const manifest: SessionManifest = {
        permissions:
          test.manifest?.permissions ?? fixture.manifest?.permissions ?? [],
        allowedDomains:
          test.manifest?.allowedDomains ??
          fixture.manifest?.allowedDomains ??
          [],
      };
      const session = await adapter.openSession(manifest);
      const inbox = new Inbox();
      session.onMessage((raw) => inbox.push(raw));

      const required = new Set(test.requires ?? []);
      if (test.steps.some(isEventStep)) required.add("events");
      const missing = [...required].filter((cap) =>
        cap === "events"
          ? !session.triggerEvent
          : !(session.capabilities ?? []).includes(cap),
      );
      if (missing.length > 0) {
        report.skipped++;
        report.skippedTests.push({
          fixture: fixture.name,
          test: test.name,
          reason: `adapter missing capabilities: ${missing.join(", ")}`,
        });
        await session.close();
        continue;
      }

      let failure: string | null = null;
      for (let i = 0; i < test.steps.length && failure === null; i++) {
        const step = test.steps[i];
        if (step === undefined) continue;
        if (isCallStep(step))
          failure = await runCallStep(session, inbox, step, timeoutMs);
        else if (isEventStep(step))
          failure = await runEventStep(session, inbox, step, timeoutMs);
        else if (isRawStep(step))
          failure = await runRawStep(session, inbox, step, 300);
        else failure = `step ${i}: unknown step shape ${JSON.stringify(step)}`;
        if (failure !== null) {
          report.failed++;
          report.failures.push({
            fixture: fixture.name,
            test: test.name,
            step: i,
            message: failure,
          } as Failure);
        }
      }
      if (failure === null) report.passed++;
      await session.close();
    }
  }
  return report;
}
