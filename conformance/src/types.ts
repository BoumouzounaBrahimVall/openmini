/**
 * Conformance types. These deliberately do NOT import from any runtime/host
 * package: the fixtures + this file are the bridge spec made executable
 * (`specs/bridge-protocol.md`), and every host implementation is tested
 * against them from the outside.
 */

export type ErrorCode =
  | "PERMISSION_DENIED"
  | "API_NOT_FOUND"
  | "INVALID_PAYLOAD"
  | "NETWORK_DOMAIN_BLOCKED"
  | "HOST_ERROR"
  | "TIMEOUT";

export type HostEventName = "app.show" | "app.hide" | "app.destroy";

/** Subset of the manifest a host needs to configure a bridge session. */
export interface SessionManifest {
  permissions: string[];
  allowedDomains: string[];
}

/**
 * One live bridge channel to the host under test.
 *
 * Extensibility: optional members are *capabilities*. The runner detects
 * them and SKIPS (never silently passes) tests that need a missing one.
 * Future capabilities (e.g. `setNetworkState`) follow the same pattern:
 * add the optional method here + a step kind in the runner.
 */
export interface ConformanceSession {
  send(raw: string): void;
  onMessage(cb: (raw: string) => void): void;
  /** Capability: ask the host to emit a host.event (test control channel). */
  triggerEvent?(event: HostEventName): void | Promise<void>;
  /** Declared capability names (e.g. "customApis"). Tests with `requires` not covered here are skipped visibly. */
  capabilities?: string[];
  close(): void | Promise<void>;
}

export interface ConformanceAdapter {
  name: string;
  openSession(
    manifest: SessionManifest,
  ): ConformanceSession | Promise<ConformanceSession>;
}

/* ---------- fixture file format (version 1) ---------- */

export interface FixtureFile {
  /** Bump when the fixture format changes shape; runner refuses unknown versions. */
  conformanceVersion?: 1;
  name: string;
  manifest?: Partial<SessionManifest>;
  tests: FixtureTest[];
}

export interface FixtureTest {
  name: string;
  /** Overrides the file-level manifest wholesale per field. */
  manifest?: Partial<SessionManifest>;
  /** Capability names this test needs (event steps auto-require "events"). */
  requires?: string[];
  steps: FixtureStep[];
}

export type FixtureStep = CallStep | EventStep | RawStep;

export interface CallStep {
  call: { api: string; payload: unknown };
  expect: { ok: boolean; result?: unknown; errorCode?: ErrorCode };
}

export interface EventStep {
  triggerEvent: HostEventName;
  expectEvent: { event: HostEventName };
}

export interface RawStep {
  sendRaw: string;
  expectNoReply: true;
}

/* ---------- report ---------- */

export interface Failure {
  fixture: string;
  test: string;
  step: number;
  message: string;
}

export interface Report {
  adapter: string;
  passed: number;
  failed: number;
  skipped: number;
  failures: Failure[];
  /** Tests skipped for a missing capability, so gaps are visible, never silent. */
  skippedTests: { fixture: string; test: string; reason: string }[];
}
