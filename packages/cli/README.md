# @openmini/cli

Build tooling for [OpenMini](https://github.com/BoumouzounaBrahimVall/openmini)
mini-apps: create, develop in a browser mock host, package deterministically,
and publish to any static file server.

```sh
npm install -g @openmini/cli
```

| Command                            | What it does                                                                     |
| ---------------------------------- | -------------------------------------------------------------------------------- |
| `mini create <name>`               | Scaffold a plain React + TS mini-app with a `manifest.json`                      |
| `mini dev`                         | Dev server with the full `mini.*` bridge mocked in the browser                   |
| `mini build`                       | Production build (relative URLs — packages are relocatable)                      |
| `mini pack`                        | Deterministic `.mpkg`: per-file sha256 manifest + CSP injected from the manifest |
| `mini publish --registry <target>` | Write the static registry layout (local dir or `s3://bucket[/prefix]`)           |
| `mini inspect <package>`           | Show a package's manifest, hashes, and contents                                  |

The registry a publish produces is just files —
[specs/registry-protocol.md](../../specs/registry-protocol.md). Package
integrity rules: [specs/package-format.md](../../specs/package-format.md).

Start here: [quickstart](../../docs/quickstart.md) (zero to running mini-app
in under 15 minutes).
