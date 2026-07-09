import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import type { Manifest } from "../../domain/manifest-schema.js";

const VIRTUAL_ID = "virtual:openmini-dev-boot";
const RESOLVED_ID = `\0${VIRTUAL_ID}`;
const DEV_HOST_SPECIFIER = "@openmini/cli/dev-host";

// The boot module imports the dev host from this very package; resolve the
// specifier to our own file so it works even when the app dir has no
// node_modules (tests) or would resolve a different copy.
function selfDevHostPath(): string {
  const js = fileURLToPath(
    new URL("../../dev-host/browser-host.js", import.meta.url),
  );
  return existsSync(js) ? js : js.replace(/\.js$/, ".ts");
}

/**
 * Injects the dev-host bootstrap as the first module of the page: creates the
 * browser host from the app's manifest and wires the global binding contract
 * the `mini` singleton connects to.
 */
export function openminiDevPlugin(manifest: Manifest): Plugin {
  return {
    name: "openmini:dev-boot",
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID;
      if (id === DEV_HOST_SPECIFIER) return selfDevHostPath();
      return undefined;
    },
    load(id) {
      if (id !== RESOLVED_ID) return undefined;
      return [
        `import { createDevHost, wireDevGlobals } from "@openmini/cli/dev-host";`,
        `const manifest = ${JSON.stringify(manifest)};`,
        `const host = createDevHost({`,
        `  appId: manifest.id,`,
        `  manifest: { permissions: manifest.permissions ?? [], allowedDomains: manifest.allowedDomains ?? [] },`,
        `  debug: true,`,
        `});`,
        `wireDevGlobals(host, { appId: manifest.id, appVersion: manifest.version });`,
      ].join("\n");
    },
    transformIndexHtml() {
      return [
        {
          tag: "script",
          attrs: { type: "module", src: `/@id/__x00__${VIRTUAL_ID}` },
          injectTo: "head-prepend" as const,
        },
      ];
    },
  };
}
