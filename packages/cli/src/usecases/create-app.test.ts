import { describe, expect, it } from "vitest";
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
    expect(written).toEqual([".gitignore", "manifest.json", "src/App.tsx"]);
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
