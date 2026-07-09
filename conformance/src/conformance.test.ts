import { describe, expect, it } from "vitest";
import { MockHostAdapter } from "./mock-host.js";
import { runConformance } from "./runner.js";
import type { ConformanceAdapter, ConformanceSession } from "./types.js";

describe("conformance suite", () => {
  it("the reference mock host passes everything, nothing skipped", async () => {
    const report = await runConformance(new MockHostAdapter());
    expect(report.failures).toEqual([]);
    expect(report.failed).toBe(0);
    expect(report.skipped).toBe(0);
    expect(report.passed).toBeGreaterThanOrEqual(21);
  });

  it("a non-compliant host fails loudly", async () => {
    // Replies ok:null to every call and has no event capability.
    const broken: ConformanceAdapter = {
      name: "broken-host",
      openSession(): ConformanceSession {
        let cb: ((raw: string) => void) | null = null;
        return {
          send(raw: string) {
            const msg = JSON.parse(raw) as Record<string, unknown>;
            if (msg["type"] !== "bridge.call") return;
            cb?.(
              JSON.stringify({
                v: 1,
                type: "bridge.result",
                id: msg["id"],
                ok: true,
                result: null,
              }),
            );
          },
          onMessage(fn) {
            cb = fn;
          },
          close() {
            cb = null;
          },
        };
      },
    };
    const report = await runConformance(broken, { timeoutMs: 400 });
    expect(report.failed).toBeGreaterThan(0);
    expect(report.skipped).toBeGreaterThan(0); // event tests skipped, visibly
  });
});
