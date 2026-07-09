# @openmini/conformance

The bridge spec (`specs/bridge-protocol.md`) made executable: golden fixtures
plus a transport-agnostic runner. **A host is OpenMini-compatible iff this
suite is green.** The browser mock host (ticket 07), the React Native host
(ticket 14), and any future host (Flutter, ticket 22) all run the same suite.

```ts
import { runConformance, MockHostAdapter } from "@openmini/conformance";

const report = await runConformance(new MockHostAdapter());
// report: { passed, failed, skipped, failures[], skippedTests[] }
```

## Writing an adapter for a real host

Implement `ConformanceAdapter`: `openSession(manifest)` returns a live bridge
channel (`send(raw)` / `onMessage(cb)` / `close()`) configured with the given
`permissions` and `allowedDomains`. See `src/mock-host.ts` for the reference
implementation — it is intentionally literate.

- **Events capability**: implement optional `triggerEvent(event)` (a test-only
  control channel — e.g. backgrounding the app in an E2E driver). Without it,
  event tests are **skipped and reported**, never silently passed.
- **Custom host APIs capability** (`"customApis"` in `session.capabilities`):
  register a test API `conformanceEcho` that returns its payload verbatim.
  Fixtures then verify the `host.*` passthrough semantics (bridge-protocol
  §5.1): permission `host:<name>` checked first, `API_NOT_FOUND` for declared
  but unregistered names.
- **Network echo convention**: fixtures call `GET {{ALLOWED_ORIGIN}}/echo`,
  which must return status 200 with body exactly `{"ok":true}`; any other path
  on the allowed origin returns 404. In-memory hosts fake this (see mock);
  device drivers should run a local echo server and pass its origin via
  `placeholders: { ALLOWED_ORIGIN: "http://localhost:<port>" }`.
- **Timeouts**: raise `timeoutMs` for slow transports (real devices).

## Extension points

- **New APIs / fixture packs**: drop `*.json` files in a directory and pass
  `fixtureDirs: [defaultFixturesDir(), myDir]` — coverage composes, no
  registry to edit. Fixture files may declare `conformanceVersion` (current: 1).
- **Placeholders**: any `{{NAME}}` in fixture text is substituted from the
  `placeholders` option (defaults: `ALLOWED_ORIGIN`, `BLOCKED_ORIGIN`).
- **Matcher tokens**: expected values support `{"$any":true}`, `{"$type":"string"}`,
  `{"$enum":[...]}`; register new tokens with `registerToken("$regex", fn)`.
- **Capabilities**: new optional `ConformanceSession` methods + a step kind in
  the runner; missing capabilities skip visibly (`report.skippedTests`).

## Rules

- Fixtures are authored from the spec, never from an implementation. If a
  fixture and the spec disagree, fix the spec first (it's the source of truth).
- The unknown-api fixture runs with all permissions granted so hosts are free
  to check permissions before or after API existence.

## Why no validation library here (Zod etc.)

Deliberate: this package is the neutral referee every host is judged against,
so it carries **zero runtime dependencies** and hand-rolled type guards. The
project-wide validation strategy (JSON Schema for the manifest, Zod host-side,
dependency-free guards in `@openmini/runtime` and here) is documented in
[`specs/architecture.md`](../specs/architecture.md).
