import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";
import type { FileSystemPort } from "../../usecases/create-app.js";

export const nodeFs: FileSystemPort = {
  exists: (path) => existsSync(path),
  mkdirp: (path) => {
    if (path !== "") mkdirSync(path, { recursive: true });
  },
  readFile: (path) => readFileSync(path, "utf8"),
  writeFile: (path, content) => writeFileSync(path, content),
  listFiles: (dir) =>
    readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => relative(dir, join(entry.parentPath, entry.name))),
  join: (...parts) => join(...parts),
};
