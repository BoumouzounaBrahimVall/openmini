export interface FileSystemPort {
  exists(path: string): boolean;
  mkdirp(path: string): void;
  readFile(path: string): string;
  writeFile(path: string, content: string): void;
  /** Relative file paths under dir, recursive. */
  listFiles(dir: string): string[];
  join(...parts: string[]): string;
}

export class CliError extends Error {
  override readonly name = "CliError";
}

const NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

export interface CreateAppOptions {
  name: string;
  cwd: string;
  templateDir: string;
  fs: FileSystemPort;
}

/** Scaffolds a plain React + Vite mini-app from the template directory. */
export function createApp(options: CreateAppOptions): {
  targetDir: string;
  files: string[];
} {
  const { name, cwd, templateDir, fs } = options;
  if (!NAME_PATTERN.test(name)) {
    throw new CliError(
      `invalid app name "${name}" — use lowercase letters, digits, and dashes (e.g. "todo")`,
    );
  }
  const targetDir = fs.join(cwd, name);
  if (fs.exists(targetDir)) {
    throw new CliError(
      `${targetDir} already exists — pick another name or remove it`,
    );
  }
  const appId = `com.example.${name.replaceAll("-", "")}`;
  const written: string[] = [];
  for (const relative of fs.listFiles(templateDir)) {
    const content = fs
      .readFile(fs.join(templateDir, relative))
      .replaceAll("{{APP_NAME}}", name)
      .replaceAll("{{APP_ID}}", appId);
    // npm strips .gitignore from published packages; templates store it renamed.
    const target = relative === "_gitignore" ? ".gitignore" : relative;
    const path = fs.join(targetDir, target);
    fs.mkdirp(path.split("/").slice(0, -1).join("/"));
    fs.writeFile(path, content);
    written.push(target);
  }
  return { targetDir, files: written.sort() };
}
