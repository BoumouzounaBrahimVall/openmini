import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { RegistryTarget } from "../../usecases/publish.js";

/** Static registry on a local directory — any web server can serve it. */
export function fsRegistryTarget(baseDir: string): RegistryTarget {
  const abs = (path: string) => join(baseDir, path);
  return {
    readText: (path) =>
      Promise.resolve(
        existsSync(abs(path)) ? readFileSync(abs(path), "utf8") : null,
      ),
    writeBytes: (path, bytes) => {
      mkdirSync(dirname(abs(path)), { recursive: true });
      writeFileSync(abs(path), bytes);
      return Promise.resolve();
    },
    writeTextAtomic: (path, text) => {
      mkdirSync(dirname(abs(path)), { recursive: true });
      const tmp = `${abs(path)}.tmp-${process.pid}`;
      writeFileSync(tmp, text);
      renameSync(tmp, abs(path)); // atomic on POSIX
      return Promise.resolve();
    },
  };
}
