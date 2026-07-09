const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../..');

/**
 * Monorepo wiring for the symlinked @openmini/react-native package.
 * The workspace installs its OWN dev copies of react (for its unit tests),
 * which Metro would happily resolve from the package's real path — giving
 * two React instances and "Cannot read property 'useRef' of null". Pin the
 * singletons to THIS app's node_modules for every importer.
 */
// async-storage is pinned too: pnpm auto-installs the (optional) peer under
// packages/react-native/node_modules at its OWN version, and a JS copy that
// mismatches this app's native module majors fails with "Native module is
// null". Every importer must get the app's copy.
const SINGLETONS = [
  'react',
  'react-native',
  '@babel/runtime',
  '@react-native-async-storage/async-storage',
];

const config = {
  watchFolders: [repoRoot],
  server: {
    // Conformance echo convention (conformance/README): the on-device suite
    // uses the Metro origin as ALLOWED_ORIGIN, so /echo answers here and the
    // fixture's negative path gets an explicit 404 without shadowing Metro.
    enhanceMiddleware: middleware => (req, res, next) => {
      if (req.url === '/echo') {
        res.setHeader('content-type', 'application/json');
        res.end('{"ok":true}');
        return;
      }
      if (req.url === '/does-not-exist') {
        res.statusCode = 404;
        res.end('');
        return;
      }
      // Demo static registry: regenerate with
      //   cd examples/todo && pnpm exec mini publish --registry ../../apps/playground/registry --force
      if (req.url && req.url.startsWith('/registry/')) {
        const registryRoot = path.join(__dirname, 'registry');
        const rel = decodeURIComponent(req.url.split('?')[0]).slice(
          '/registry/'.length,
        );
        const file = path.normalize(path.join(registryRoot, rel));
        if (
          !file.startsWith(registryRoot + path.sep) ||
          !fs.existsSync(file) ||
          !fs.statSync(file).isFile()
        ) {
          res.statusCode = 404;
          res.end('');
          return;
        }
        res.setHeader(
          'content-type',
          file.endsWith('.json')
            ? 'application/json'
            : 'application/octet-stream',
        );
        res.end(fs.readFileSync(file));
        return;
      }
      return middleware(req, res, next);
    },
  },
  resolver: {
    extraNodeModules: {
      fflate: path.join(repoRoot, 'packages/react-native/node_modules/fflate'),
      zod: path.join(repoRoot, 'packages/react-native/node_modules/zod'),
      '@openmini/runtime': path.join(repoRoot, 'packages/runtime'),
    },
    resolveRequest: (context, moduleName, platform) => {
      const pinned = SINGLETONS.find(
        name => moduleName === name || moduleName.startsWith(`${name}/`),
      );
      if (pinned) {
        return context.resolveRequest(
          {
            ...context,
            nodeModulesPaths: [path.join(__dirname, 'node_modules')],
            disableHierarchicalLookup: true,
          },
          moduleName,
          platform,
        );
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
