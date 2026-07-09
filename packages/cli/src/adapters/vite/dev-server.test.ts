import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { nodeFs } from "../node/node-fs.js";
import { createApp } from "../../usecases/create-app.js";
import { loadManifest } from "../../usecases/dev.js";
import { createDevServer } from "./dev-server.js";

const scratch = mkdtempSync(join(tmpdir(), "openmini-create-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const templateDir = fileURLToPath(
  new URL("../../../templates/react/", import.meta.url),
);

describe("mini create + mini dev (server level)", () => {
  it("scaffolds the real template and its manifest validates", () => {
    const { files } = createApp({
      name: "smoke",
      cwd: scratch,
      templateDir,
      fs: nodeFs,
    });
    expect(files).toContain("manifest.json");
    expect(files).toContain("src/App.tsx");
    expect(files).toContain(".gitignore");
    const manifest = loadManifest(join(scratch, "smoke"), nodeFs);
    expect(manifest.id).toBe("com.example.smoke");
    // decision #3: no custom UI components anywhere in the template
    expect(nodeFs.readFile(join(scratch, "smoke/src/App.tsx"))).not.toContain(
      "@openmini/react",
    );
  });

  it("dev server injects the dev-host boot module into the page", async () => {
    const appDir = join(scratch, "smoke");
    const manifest = loadManifest(appDir, nodeFs);
    const server = await createDevServer({ appDir, manifest });
    try {
      const html = await server.transformIndexHtml(
        "/",
        nodeFs.readFile(join(appDir, "index.html")),
      );
      expect(html).toContain("virtual:openmini-dev-boot");
      const boot = await server.transformRequest("virtual:openmini-dev-boot");
      expect(boot?.code).toContain("com.example.smoke");
      expect(boot?.code).toContain("wireDevGlobals");
    } finally {
      await server.close();
    }
  });

  it("loadManifest fails with a clear message on an invalid manifest", () => {
    const dir = join(scratch, "broken");
    nodeFs.mkdirp(dir);
    nodeFs.writeFile(
      join(dir, "manifest.json"),
      JSON.stringify({ manifestVersion: 1, id: "nope" }),
    );
    expect(() => loadManifest(dir, nodeFs)).toThrow(
      /manifest\.json is invalid[\s\S]*manifest\.id/,
    );
  });
});
