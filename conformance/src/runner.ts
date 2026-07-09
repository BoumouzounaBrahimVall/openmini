/**
 * Node-side entry: loads fixture files from disk, then delegates to the
 * portable suite core (suite.ts). Environments without a filesystem (the
 * on-device driver) import `runSuite` + `applyPlaceholders` directly.
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { DEFAULT_PLACEHOLDERS, runSuite } from "./suite.js";
import type { ConformanceAdapter, FixtureFile, Report } from "./types.js";

export interface RunOptions {
  /** Directories of fixture *.json files. Defaults to the built-in set; append your own to extend coverage (e.g. per-API expansion packs). */
  fixtureDirs?: string[];
  /** Placeholder substitutions applied to raw fixture text before parsing. Defaults provide ALLOWED_ORIGIN / BLOCKED_ORIGIN. */
  placeholders?: Record<string, string>;
  /** Per-reply timeout. Raise for slow transports (real devices). */
  timeoutMs?: number;
}

/**
 * Lazy + scheme-tolerant: under vitest's jsdom environment import.meta.url is
 * served over http (/@fs/…), not file:, so resolve on demand instead of at
 * module load.
 */
export function defaultFixturesDir(): string {
  const url = new URL("../fixtures/", import.meta.url);
  if (url.protocol === "file:") return fileURLToPath(url);
  const pathname = decodeURIComponent(url.pathname);
  // vite serves /@fs/<abs> for out-of-root files, else project-root-relative.
  return pathname.startsWith("/@fs/")
    ? pathname.slice(4)
    : join(process.cwd(), pathname);
}

export function loadFixtures(
  dirs: string[] = [defaultFixturesDir()],
  placeholders: Record<string, string> = DEFAULT_PLACEHOLDERS,
): FixtureFile[] {
  const files: FixtureFile[] = [];
  for (const dir of dirs) {
    for (const entry of readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .sort()) {
      let text = readFileSync(join(dir, entry), "utf8");
      for (const [key, value] of Object.entries(placeholders)) {
        text = text.replaceAll(`{{${key}}}`, value);
      }
      const fixture = JSON.parse(text) as FixtureFile;
      if (
        fixture.conformanceVersion !== undefined &&
        fixture.conformanceVersion !== 1
      ) {
        throw new Error(
          `${entry}: unsupported conformanceVersion ${String(fixture.conformanceVersion)}`,
        );
      }
      files.push(fixture);
    }
  }
  return files;
}

export async function runConformance(
  adapter: ConformanceAdapter,
  opts: RunOptions = {},
): Promise<Report> {
  const placeholders = { ...DEFAULT_PLACEHOLDERS, ...opts.placeholders };
  const fixtures = loadFixtures(
    opts.fixtureDirs ?? [defaultFixturesDir()],
    placeholders,
  );
  return runSuite(adapter, fixtures, { timeoutMs: opts.timeoutMs });
}
