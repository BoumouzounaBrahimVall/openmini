/**
 * Node adapters for tests and tooling ONLY — not exported from the package
 * index (React Native bundlers must never see node: imports). The native module
 * provides the production FileStore/Hasher.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { FileStore } from "../ports/file-store.js";
import type { Hasher } from "../ports/hasher.js";

export const nodeFileStore: FileStore = {
  exists: (path) => Promise.resolve(existsSync(path)),
  readText: async (path) => {
    try {
      return await readFile(path, "utf8");
    } catch {
      return null;
    }
  },
  writeFile: async (path, content) => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  },
  rename: (from, to) => rename(from, to),
  removeDir: (path) => rm(path, { recursive: true, force: true }),
};

export const nodeHasher: Hasher = {
  sha256: (bytes) => createHash("sha256").update(bytes).digest("hex"),
};
