# Architecture — hexagonal (ports & adapters)

Decision: **hexagonal architecture** across all packages. Chosen over generic
"clean architecture" because this project IS a ports story: the bridge
protocol is a port, every host (browser mock, React Native, future Flutter)
is an adapter, and the conformance suite is the port-level contract test.
The architecture names what the product already is.

## The one rule that matters

**Dependencies point inward.** Adapters → use cases → ports/domain. Domain
and use-case code imports nothing external — no fs, no fetch, no React, no
native modules, no Vite. Everything side-effectful sits behind a port
interface and is injected at a single composition root per package.

Everything else below is convention; this rule is law. Review against it.

## Per-package mapping

### `packages/runtime` (runs inside the mini-app)

- **Domain**: protocol types, call correlation + timeout state machine,
  lifecycle event dispatch — pure TS, zero platform APIs.
- **Ports (outbound)**: `Transport { send(raw); onMessage(cb) }` — the ONLY
  way the runtime touches the outside; `Clock` for timeouts (testability).
- **Inbound surface**: the `mini.*` facade (including `mini.host.invoke`).
- **Adapters**: WebView binding (production), in-memory transport (tests,
  conformance), dev-server binding.
- **Composition root**: `createMiniRuntime({ transport })`.

### `packages/cli`

- **Use cases**: `pack`, `publish`, `inspect`, `dev` — pure orchestration,
  unit-testable with in-memory fakes.
- **Ports (outbound)**: `FileSystem`, `Archive` (zip), `Hasher`,
  `RegistryTarget` (fs/S3 publishers), `Bundler` (Vite behind a port).
- **Inbound adapters**: argv command parsing → use-case input DTOs.
- **Composition root**: the bin entry.

### `packages/react-native` (host SDK)

- **Use cases** (TS): `resolvePackage` (registry → verify → cache),
  `openMiniApp` (session lifecycle), bridge host routing (built-ins +
  registered `host.*` custom APIs).
- **Ports (outbound)**: `RegistryClient`, `PackageCache`, `HashVerifier`,
  `NativeWebView` (the Kotlin/Swift boundary), `HostApiHandlers`.
- **Adapters**: fetch-based registry client, fs cache, the native scheme-
  serving WebView module, `<MiniAppView>` as the inbound React adapter.
- **Native code stays thin**: Kotlin/Swift implement `NativeWebView` and
  nothing else — routing, permission checks, and validation live in TS where
  they are unit-testable and shared per platform.

### `conformance/`

Already hexagonal by construction: it tests the bridge port from outside via
`ConformanceAdapter`, with zero knowledge of any implementation.

## Folder convention (inside each package's `src/`)

```txt
src/
  domain/        # pure logic + types
  ports/         # interfaces only
  usecases/      # orchestration, depends on domain + ports
  adapters/      # one folder per technology (webview/, fs/, vite/, ...)
  index.ts       # composition root + public API
```

Pragmatism clauses (so this stays quality, not ceremony):

- A package smaller than ~300 lines may flatten folders, but the import
  direction rule still applies and splitting is expected as it grows.
- No empty layers: don't create `usecases/` for a one-line passthrough.
- Files 200–400 lines typical (repo rule); a fat adapter is a smell that a
  port is missing.

## Validation strategy (decision, 2026-07-08)

| Layer                                | Tool                                                                              | Why                                                                                                     |
| ------------------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Manifest (CLI, hosts, registries)    | **JSON Schema** (canonical schema lives in `specs/manifest.md`; enforce with ajv) | Language-neutral: Flutter/Go/third-party implementations validate identically. A Zod copy would drift   |
| Bridge payloads, host side           | **Zod** (tickets 14+)                                                             | Best DX + typed errors where bundle size doesn't matter                                                 |
| Bridge payloads, `@openmini/runtime` | Hand-rolled guards                                                                | Zero-dependency AC: the runtime ships inside every mini-app; ~13 kB gzipped for 6 shapes isn't worth it |
| `conformance/`                       | Hand-rolled guards                                                                | The referee package stays dependency-free and library-agnostic                                          |

## Testing per boundary (maps to existing tickets)

- Domain/use cases: unit tests with fake ports (all packages).
- Port contracts: the conformance suite (bridge), fixture-driven.
- Adapters: integration tests against real infra (registry round-trip in CI,
  native module on device — tickets 11, 13, 17).
- E2E: the vertical-slice test (packages/react-native/src/vertical-slice.e2e.test.ts).
