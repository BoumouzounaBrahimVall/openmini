const { getDefaultConfig } = require("expo/metro-config");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "../..");
const config = getDefaultConfig(__dirname);

/**
 * Same monorepo wiring as apps/playground/metro.config.js: the symlinked
 * @openmini/react-native package must resolve singletons (and async-storage,
 * whose pnpm-installed copy can be a different major than this app's native
 * module) from THIS app's node_modules.
 */
const SINGLETONS = [
  "react",
  "react-native",
  "@babel/runtime",
  "@react-native-async-storage/async-storage",
];

config.watchFolders = [repoRoot];
config.resolver.extraNodeModules = {
  fflate: path.join(repoRoot, "packages/react-native/node_modules/fflate"),
  zod: path.join(repoRoot, "packages/react-native/node_modules/zod"),
  "@openmini/runtime": path.join(repoRoot, "packages/runtime"),
};
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const pinned = SINGLETONS.find(
    (name) => moduleName === name || moduleName.startsWith(`${name}/`),
  );
  if (pinned) {
    return context.resolveRequest(
      {
        ...context,
        nodeModulesPaths: [path.join(__dirname, "node_modules")],
        disableHierarchicalLookup: true,
      },
      moduleName,
      platform,
    );
  }
  return (defaultResolveRequest ?? context.resolveRequest)(
    context,
    moduleName,
    platform,
  );
};

// Conformance echo convention + the demo static registry (shared with the
// bare playground), served from this Metro origin.
config.server = {
  ...config.server,
  enhanceMiddleware: (middleware) => (req, res, next) => {
    if (req.url === "/echo") {
      res.setHeader("content-type", "application/json");
      res.end('{"ok":true}');
      return;
    }
    if (req.url === "/does-not-exist") {
      res.statusCode = 404;
      res.end("");
      return;
    }
    if (req.url && req.url.startsWith("/registry/")) {
      const registryRoot = path.join(repoRoot, "apps/playground/registry");
      const rel = decodeURIComponent(req.url.split("?")[0]).slice(
        "/registry/".length,
      );
      const file = path.normalize(path.join(registryRoot, rel));
      if (
        !file.startsWith(registryRoot + path.sep) ||
        !fs.existsSync(file) ||
        !fs.statSync(file).isFile()
      ) {
        res.statusCode = 404;
        res.end("");
        return;
      }
      res.setHeader(
        "content-type",
        file.endsWith(".json")
          ? "application/json"
          : "application/octet-stream",
      );
      res.end(fs.readFileSync(file));
      return;
    }
    return middleware(req, res, next);
  },
};

module.exports = config;
