import react from "@vitejs/plugin-react";
import { createServer, type ViteDevServer } from "vite";
import type { Manifest } from "../../domain/manifest-schema.js";
import { openminiDevPlugin } from "./openmini-plugin.js";

export interface DevServerOptions {
  appDir: string;
  manifest: Manifest;
  port?: number;
}

export async function createDevServer(
  options: DevServerOptions,
): Promise<ViteDevServer> {
  return createServer({
    root: options.appDir,
    configFile: false,
    plugins: [react(), openminiDevPlugin(options.manifest)],
    server:
      options.port === undefined
        ? {}
        : { port: options.port, strictPort: true },
  });
}

export async function startDevServer(
  options: DevServerOptions,
): Promise<ViteDevServer> {
  const server = await createDevServer(options);
  await server.listen();
  server.printUrls();
  return server;
}
