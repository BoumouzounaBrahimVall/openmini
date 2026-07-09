#!/usr/bin/env node
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { nodeFs } from "./adapters/node/node-fs.js";
import { startDevServer } from "./adapters/vite/dev-server.js";
import { CliError, createApp } from "./usecases/create-app.js";
import { loadManifest } from "./usecases/dev.js";
import { buildApp } from "./adapters/vite/build.js";
import {
  readDirBytes,
  resolveRuntimeVersion,
} from "./adapters/node/package-io.js";
import { packApp } from "./usecases/pack.js";
import { assertValidPackage } from "./usecases/inspect.js";
import { publishPackage } from "./usecases/publish.js";
import { fsRegistryTarget } from "./adapters/node/fs-registry.js";
import { s3RegistryTarget } from "./adapters/s3/s3-registry.js";
import { OPENMINI_CLI_VERSION } from "./index.js";

const program = new Command();

program
  .name("mini")
  .description("OpenMini mini-app tooling")
  .version(OPENMINI_CLI_VERSION);

program
  .command("create")
  .argument("<name>", "app name (lowercase letters, digits, dashes)")
  .description("scaffold a plain React + Vite mini-app")
  .action((name: string) => {
    const templateDir = fileURLToPath(
      new URL("../templates/react/", import.meta.url),
    );
    const { targetDir, files } = createApp({
      name,
      cwd: process.cwd(),
      templateDir,
      fs: nodeFs,
    });
    process.stdout.write(
      `Created ${targetDir} (${files.length} files)\n\nNext:\n  cd ${name}\n  npm install\n  npx mini dev\n`,
    );
  });

program
  .command("dev")
  .description("start the dev server with the browser mock host")
  .option("-p, --port <port>", "port", (v) => Number.parseInt(v, 10))
  .action(async (opts: { port?: number }) => {
    const manifest = loadManifest(process.cwd(), nodeFs);
    await startDevServer({ appDir: process.cwd(), manifest, port: opts.port });
  });

program
  .command("build")
  .description("production-build the mini-app (dist/web)")
  .action(async () => {
    loadManifest(process.cwd(), nodeFs);
    const outDir = await buildApp(process.cwd());
    process.stdout.write(`Built ${outDir}\n`);
  });

program
  .command("pack")
  .description("build and package the mini-app into dist/<id>-<version>.mpkg")
  .action(async () => {
    const appDir = process.cwd();
    loadManifest(appDir, nodeFs);
    const outDir = await buildApp(appDir);
    const runtime = resolveRuntimeVersion(appDir);
    const result = packApp({
      files: readDirBytes(outDir),
      manifestSource: nodeFs.readFile(join(appDir, "manifest.json")),
      runtimeVersion: runtime.version,
    });
    const warnings = [
      ...result.warnings,
      ...(runtime.warning ? [runtime.warning] : []),
    ];
    mkdirSync(join(appDir, "dist"), { recursive: true });
    const artifact = join(appDir, "dist", result.artifactName);
    writeFileSync(artifact, result.bytes);
    for (const w of warnings) process.stderr.write(`warning: ${w}\n`);
    process.stdout.write(
      `Packed ${artifact}\n  sha256 ${result.packageSha256}\n`,
    );
  });

program
  .command("inspect")
  .argument("<package>", "path to an .mpkg file")
  .description("validate a package and print its summary")
  .action((path: string) => {
    const summary = assertValidPackage(new Uint8Array(readFileSync(path)));
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  });

program
  .command("publish")
  .argument(
    "[package]",
    "path to an .mpkg (default: the single file in ./dist)",
  )
  .requiredOption(
    "--registry <target>",
    "registry directory or s3://bucket[/prefix]",
  )
  .option("--force", "replace an existing version (dev registries only)")
  .description("publish a package to a static registry (registry-protocol.md)")
  .action(
    async (
      packagePath: string | undefined,
      opts: { registry: string; force?: boolean },
    ) => {
      const resolved =
        packagePath ??
        (() => {
          const dist = join(process.cwd(), "dist");
          const mpkgs = readdirSync(dist).filter((f) => f.endsWith(".mpkg"));
          if (mpkgs.length !== 1)
            throw new CliError(
              `expected exactly one .mpkg in ${dist}, found ${mpkgs.length} — pass the package path explicitly`,
            );
          return join(dist, mpkgs[0] as string);
        })();
      const target = opts.registry.startsWith("s3://")
        ? s3RegistryTarget(
            await makeAwsClient(opts.registry),
            s3Prefix(opts.registry),
          )
        : fsRegistryTarget(opts.registry);
      const result = await publishPackage({
        bytes: new Uint8Array(readFileSync(resolved)),
        target,
        force: opts.force === true,
        now: new Date(),
      });
      process.stdout.write(
        `Published ${result.index.id}@${result.index.latest}\n  ${result.packagePath}\n`,
      );
    },
  );

function s3Prefix(url: string): string {
  return url.replace("s3://", "").split("/").slice(1).join("/");
}

async function makeAwsClient(url: string) {
  const bucket = url.replace("s3://", "").split("/")[0] ?? "";
  try {
    const sdk =
      (await import("@aws-sdk/client-s3")) as typeof import("@aws-sdk/client-s3");
    const client = new sdk.S3Client({});
    return {
      putObject: async (args: {
        key: string;
        body: Uint8Array | string;
        contentType: string;
        cacheControl: string;
      }) => {
        await client.send(
          new sdk.PutObjectCommand({
            Bucket: bucket,
            Key: args.key,
            Body: args.body,
            ContentType: args.contentType,
            CacheControl: args.cacheControl,
          }),
        );
      },
      getObjectText: async (key: string) => {
        try {
          const out = await client.send(
            new sdk.GetObjectCommand({ Bucket: bucket, Key: key }),
          );
          return (await out.Body?.transformToString()) ?? null;
        } catch {
          return null;
        }
      },
    };
  } catch (cause) {
    if (cause instanceof CliError) throw cause;
    throw new CliError(
      "s3:// registries need @aws-sdk/client-s3 — install it in your app: npm i -D @aws-sdk/client-s3",
    );
  }
}

program.parseAsync().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof CliError ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
