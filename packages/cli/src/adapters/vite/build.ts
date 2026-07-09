import { realpathSync } from "node:fs";
import { join } from "node:path";
import react from "@vitejs/plugin-react";
import { build } from "vite";

export const WEB_OUT_DIR = "dist/web";

/** Production build of the mini-app into dist/web (packaged by `mini pack`). */
export async function buildApp(appDir: string): Promise<string> {
  // realpath: vite resolves root through symlinks (macOS /var -> /private/var);
  // a non-canonical outDir would make rollup emit escaping relative paths.
  const root = realpathSync(appDir);
  const outDir = join(root, WEB_OUT_DIR);
  await build({
    root,
    configFile: false,
    logLevel: "warn",
    // Relative URLs make the package relocatable: hosts mount it anywhere
    // (iOS serves it as an origin root, Android under a path prefix).
    base: "./",
    plugins: [react()],
    build: { outDir, emptyOutDir: true },
  });
  return outDir;
}
