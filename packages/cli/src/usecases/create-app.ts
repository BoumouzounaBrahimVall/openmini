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
  /**
   * The CLI's own version, stamped into the scaffold's `@openmini/*`
   * dependencies as `^<version>`. Unstamped dev builds (0.0.0 or a
   * 0.0.0-* prerelease) and omission fall back to the `latest` dist-tag
   * so a scaffold always installs.
   */
  sdkVersion?: string;
}

function sdkVersionRange(sdkVersion: string | undefined): string {
  if (sdkVersion === undefined || /^0\.0\.0(-|$)/.test(sdkVersion))
    return "latest";
  return `^${sdkVersion}`;
}

/**
 * Git ref the scaffold's docs links point at (AGENTS.md), so agents read the
 * specs matching the installed SDK, not whatever is on main. Unstamped dev
 * builds fall back to main.
 */
function docsRef(sdkVersion: string | undefined): string {
  if (sdkVersion === undefined || /^0\.0\.0(-|$)/.test(sdkVersion))
    return "main";
  return `v${sdkVersion}`;
}

/** Scaffolds a plain React + Vite mini-app from the template directory. */
export function createApp(options: CreateAppOptions): {
  targetDir: string;
  files: string[];
} {
  const { name, cwd, templateDir, fs, sdkVersion } = options;
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
    // Tolerate inner whitespace ({{ APP_NAME }}) so a reformatted template
    // can't ship an unreplaced placeholder into the scaffold.
    const content = fs
      .readFile(fs.join(templateDir, relative))
      .replaceAll(/\{\{\s*APP_NAME\s*\}\}/g, name)
      .replaceAll(/\{\{\s*APP_ID\s*\}\}/g, appId)
      .replaceAll(
        /\{\{\s*OPENMINI_VERSION_RANGE\s*\}\}/g,
        sdkVersionRange(sdkVersion),
      )
      .replaceAll(/\{\{\s*OPENMINI_DOCS_REF\s*\}\}/g, docsRef(sdkVersion));
    // npm strips .gitignore from published packages; templates store it renamed.
    const target = relative === "_gitignore" ? ".gitignore" : relative;
    const path = fs.join(targetDir, target);
    fs.mkdirp(path.split("/").slice(0, -1).join("/"));
    fs.writeFile(path, content);
    written.push(target);
  }
  return { targetDir, files: written.sort() };
}
