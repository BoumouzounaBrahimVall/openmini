import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { nodeFs } from "../adapters/node/node-fs.js";
import { parseManifest } from "./validate-manifest.js";
import { createApp, type FileSystemPort } from "./create-app.js";

function memoryFs(template: Record<string, string>) {
  const files = new Map<string, string>(
    Object.entries(template).map(([k, v]) => [`/tpl/${k}`, v]),
  );
  const fs: FileSystemPort = {
    exists: (p) =>
      [...files.keys()].some((k) => k === p || k.startsWith(`${p}/`)),
    mkdirp: () => {},
    readFile: (p) => {
      const c = files.get(p);
      if (c === undefined) throw new Error(`ENOENT ${p}`);
      return c;
    },
    writeFile: (p, c) => void files.set(p, c),
    listFiles: (dir) =>
      [...files.keys()]
        .filter((k) => k.startsWith(`${dir}/`))
        .map((k) => k.slice(dir.length + 1)),
    join: (...parts) => parts.join("/"),
  };
  return { fs, files };
}

const TEMPLATE = {
  "manifest.json": `{"manifestVersion":1,"id":"{{APP_ID}}","name":"{{APP_NAME}}","version":"0.1.0","runtimeVersion":">=0.0.0"}`,
  "package.json": `{"dependencies":{"@openmini/runtime":"{{OPENMINI_VERSION_RANGE}}"},"devDependencies":{"@openmini/cli":"{{OPENMINI_VERSION_RANGE}}"}}`,
  "src/App.tsx": "export const name = '{{APP_NAME}}';",
  _gitignore: "node_modules/",
};

describe("mini create", () => {
  it("scaffolds with placeholders replaced and a VALID manifest", () => {
    const { fs, files } = memoryFs(TEMPLATE);
    const { targetDir, files: written } = createApp({
      name: "my-todo",
      cwd: "/apps",
      templateDir: "/tpl",
      fs,
    });
    expect(targetDir).toBe("/apps/my-todo");
    expect(written).toEqual([
      ".gitignore",
      "manifest.json",
      "package.json",
      "src/App.tsx",
    ]);
    const manifest = parseManifest(
      files.get("/apps/my-todo/manifest.json") ?? "",
    );
    expect(manifest).toMatchObject({
      ok: true,
      manifest: { id: "com.example.mytodo", name: "my-todo" },
    });
    expect(files.get("/apps/my-todo/src/App.tsx")).toContain("my-todo");
    expect(files.has("/apps/my-todo/.gitignore")).toBe(true);
  });

  it("stamps @openmini/* deps as ^<sdkVersion>", () => {
    const { fs, files } = memoryFs(TEMPLATE);
    createApp({
      name: "todo",
      cwd: "/apps",
      templateDir: "/tpl",
      fs,
      sdkVersion: "0.1.0",
    });
    const pkg = JSON.parse(files.get("/apps/todo/package.json") ?? "") as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(pkg.dependencies["@openmini/runtime"]).toBe("^0.1.0");
    expect(pkg.devDependencies["@openmini/cli"]).toBe("^0.1.0");
  });

  it.each([undefined, "0.0.0", "0.0.0-dev.1"])(
    "falls back to the latest dist-tag for unstamped builds (%s)",
    (sdkVersion) => {
      const { fs, files } = memoryFs(TEMPLATE);
      createApp({
        name: "todo",
        cwd: "/apps",
        templateDir: "/tpl",
        fs,
        sdkVersion,
      });
      const pkg = JSON.parse(files.get("/apps/todo/package.json") ?? "") as {
        dependencies: Record<string, string>;
      };
      expect(pkg.dependencies["@openmini/runtime"]).toBe("latest");
    },
  );

  it("replaces placeholders written with inner whitespace", () => {
    const { fs, files } = memoryFs({
      ...TEMPLATE,
      "src/App.tsx": "<h1>{{ APP_NAME }}</h1>",
    });
    createApp({ name: "my-todo", cwd: "/apps", templateDir: "/tpl", fs });
    expect(files.get("/apps/my-todo/src/App.tsx")).toBe("<h1>my-todo</h1>");
  });

  it("refuses bad names and existing targets", () => {
    const { fs } = memoryFs(TEMPLATE);
    expect(() =>
      createApp({ name: "My App", cwd: "/apps", templateDir: "/tpl", fs }),
    ).toThrow(/invalid app name/);
    createApp({ name: "todo", cwd: "/apps", templateDir: "/tpl", fs });
    expect(() =>
      createApp({ name: "todo", cwd: "/apps", templateDir: "/tpl", fs }),
    ).toThrow(/already exists/);
  });
});

describe("mini create (real react template)", () => {
  const cwd = mkdtempSync(nodeFs.join(tmpdir(), "openmini-create-"));
  afterEach(() => rmSync(cwd, { recursive: true, force: true }));

  it("scaffolds with no unreplaced {{ … }} placeholders", () => {
    const templateDir = fileURLToPath(
      new URL("../../templates/react", import.meta.url),
    );
    const { targetDir, files } = createApp({
      name: "demo",
      cwd,
      templateDir,
      fs: nodeFs,
    });
    for (const file of files) {
      const content = nodeFs.readFile(nodeFs.join(targetDir, file));
      expect(content, `${file} has an unreplaced placeholder`).not.toMatch(
        /\{\{[^}]*\}\}/,
      );
    }
    expect(nodeFs.readFile(nodeFs.join(targetDir, "src/App.tsx"))).toContain(
      "<h1>demo</h1>",
    );
  });
});
