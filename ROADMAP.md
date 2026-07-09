# OpenMini — Enhanced Roadmap (v2)

> An open-source, **self-hosted** mini-app runtime for React Native host apps.
> Mini-apps are plain React web apps + a typed `mini.*` bridge SDK, packaged as
> signed-later `.mpkg` files, distributed through a static-file registry protocol
> you can host on any web server.

This replaces the phasing of `mini-programs-framework-roadmap.md` (kept for
reference). It is the result of a stress-test interview; every major decision
below was made explicitly, not defaulted.

---

## 1. Decision log (locked)

| #   | Decision          | Choice                                          | Why                                                                                                                                                                            |
| --- | ----------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Project driver    | Speculative OSS product                         | Wedge: open-source + self-hosted alternative to Ionic Portals / FinClip                                                                                                        |
| 2   | Flutter SDK       | **Deferred until pull exists**                  | Two host SDKs doubles every bridge change; conformance suite makes the later port cheap                                                                                        |
| 3   | Mini-app UI layer | **Plain React, no wrappers**                    | No `View/Text/Button` abstraction. Mini-apps use any web UI kit; we ship only the bridge SDK                                                                                   |
| 4   | Work rhythm       | Bursty/irregular                                | Roadmap is session-sized, resumable, state written down                                                                                                                        |
| 5   | Registry          | **Static-file protocol first**                  | Registry = spec'd URL layout any static host (S3/nginx/Pages) satisfies. Server with auth/channels is a _later implementation_ of the protocol                                 |
| 6   | WebView serving   | **Native scheme handlers + Expo config plugin** | `WKURLSchemeHandler` (iOS) + `WebViewAssetLoader` (Android). No `file://` swamp. "Works in Expo dev builds" is an MVP success criterion                                        |
| 7   | Security posture  | **CSP + hashes + honest docs**                  | Enforce what's enforceable (build-time CSP from `allowedDomains`, package hash verification, namespaced `mini.storage`); document the rest in SECURITY.md. No security theater |
| 8   | Validation        | **Hard gates**                                  | After the vertical slice: public launch + 3 external quickstart runs BEFORE any breadth (Flutter, server, signing). Pivot review after two failed distribution pushes          |

Added after the interview (2026-07-08, session decisions):

| #   | Decision            | Choice                                                                            | Why                                                                                                                                                                                                                                                                                           |
| --- | ------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 9   | Custom host APIs    | **In MVP: `host.*` passthrough**                                                  | Every real host needs to share super-app data/actions with mini-apps (Portals' killer feature). Spec §5.1 + `host:<name>` permissions                                                                                                                                                         |
| 10  | Architecture        | **Hexagonal (ports & adapters)**                                                  | The bridge IS a port; hosts are adapters; conformance is the port contract test. See `specs/architecture.md`                                                                                                                                                                                  |
| 11  | Validation strategy | JSON Schema (manifest) · Zod (host-side) · zero-dep guards (runtime, conformance) | Language-neutral where the protocol crosses ecosystems; DX where bundle size doesn't matter. See `specs/architecture.md`                                                                                                                                                                      |
| 12  | TypeScript 7        | **Deferred — blocked by typescript-eslint**                                       | Trialed 2026-07-09: tsc 7.0.2 builds all packages incl. `.d.ts` and tests pass, but `@typescript-eslint/typescript-estree` crashes on the native package (old JS compiler API removed). Re-try when typescript-eslint ships TS7 support; build-speed win is small at current repo size anyway |

Resolved without discussion (low-stakes, reversible):

- **Name**: OpenMini. `openmini` and the `@openmini` npm scope are unclaimed as of 2026-07-08 — claim the scope in Phase 0.
- **Monorepo**: plain pnpm workspaces. No Nx until package count or build graph hurts.
- **Package format**: `.mpkg` = zip. Manifest = JSON. Versioning = SemVer. Bridge = JSON request/response (as in the original roadmap §4.4 — that design survives unchanged).

## 2. Positioning (do this work, it's the product)

The original roadmap benchmarked against WeChat/FinClip and missed the closest
competitor. Know the field:

|                | Ionic Portals                    | FinClip                          | **OpenMini**                              |
| -------------- | -------------------------------- | -------------------------------- | ----------------------------------------- |
| Model          | Web mini-apps in native/RN hosts | WeChat-style mini-programs       | Web mini-apps in RN (later Flutter) hosts |
| License        | Commercial                       | Commercial, free tier            | **Apache-2.0**                            |
| Distribution   | Appflow (their cloud)            | Their cloud / on-prem enterprise | **Any static file server you own**        |
| Mini-app stack | Any web framework                | Proprietary DSL                  | Plain React/TS + typed bridge             |

The one-sentence pitch the README must earn:

> _Portals, but open-source — and your registry is an S3 bucket._

Everything in the MVP serves that sentence. Anything that doesn't is deferred.

## 3. Architecture (trimmed)

Five packages, not twelve. Split further only when a boundary hurts.

```txt
openmini/
  packages/
    runtime/          # @openmini/runtime — bridge client, lifecycle, mini.* API, protocol types
    cli/              # @openmini/cli — create / dev / build / pack / publish
    react-native/     # @openmini/react-native — host SDK: native WebView wrapper, bridge host,
                      #   package download+cache+verify, Expo config plugin
  conformance/        # golden bridge fixtures + harness (any host must pass)
  specs/              # bridge-protocol.md, manifest.md, package-format.md, registry-protocol.md
  examples/todo/      # plain React + Vite mini-app
  apps/playground/    # bare RN + Expo playground apps
```

Cut from the original roadmap (and why):

- `@openmini/react` component library — decision #3, YAGNI inside a WebView.
- `compiler` package — none needed; `mini build` wraps Vite with a plugin that injects the runtime bootstrap and CSP.
- `registry-server`, `bridge-core`, `manifest`, `package-format`, `crypto`, `dev-server`, `registry-client`, `ui-components` as separate packages — folded into `runtime`/`cli` until they earn independence.
- Flutter SDK, signing, native components, permissions UI — pull-gated backlog (§9).

The architectural invariant from the original roadmap **stands and is the most
important rule in the project**:

> The package format, manifest, bridge protocol, and registry protocol are
> host-framework independent. React Native is just the first host adapter.

## 4. The AI-assisted working model

This roadmap assumes most code is written by AI agents in bursty sessions.
Three mechanisms make that work:

**Specs are the prompt.** Every file in `specs/` doubles as agent context.
They are written first, kept current, and pasted/referenced at the start of any
agent task. A drifted spec is a bug. Add a repo `CLAUDE.md` summarizing
architecture + invariants so every session starts oriented.

**The conformance suite is the verification loop.** AI iteration quality is
bounded by the quality of the done-signal. `conformance/` holds golden
request/response fixtures for every bridge API plus a harness that drives any
host implementation through them. "Implement the bridge host in RN" and (later)
"port the host to Flutter" become mechanical, agent-executable tasks: _make the
suite green._ Build it before the first host, not after.

**Sessions leave written state.** Because work is bursty:

- `STATE.md` at repo root: 10 lines max — last session's outcome, next task, open questions. Updated at the end of every session.
- Every task below is sized to fit one session (2–4h) and has a verification command. If a task doesn't fit, split it before starting.
- End-of-session ritual: verify → commit → update `STATE.md`. A session that ends without a commit was too big.

## 5. Phase 0 — Specs, spike, harness (~5 sessions)

Goal: de-risk the architecture before writing the product.

| Task                       | Deliverable                                                                                                                                                                | Verified by                                                                              |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 0.1 Repo + scope           | pnpm workspace, TS config, CI skeleton, `@openmini` npm scope claimed, `CLAUDE.md`, `STATE.md`                                                                             | `pnpm install && pnpm build` green in CI                                                 |
| 0.2 Specs v1               | `bridge-protocol.md`, `manifest.md`, `package-format.md`, `registry-protocol.md` — 1–3 pages each, written with AI, reviewed by you                                        | You can answer the original roadmap's Phase-0 questions from the docs alone              |
| 0.3 **The spike**          | Bare RN app (no SDK) loading a local folder of HTML/JS/CSS into a WebView via `WKURLSchemeHandler` (iOS) + `WebViewAssetLoader` (Android), with a `postMessage` round-trip | Same HTML loads, fetches a relative asset, and echoes a bridge message on both platforms |
| 0.4 Registry protocol spec | Static URL layout: `/{appId}/index.json` (versions, hashes, channels) + `/{appId}/{version}/app.mpkg`                                                                      | Spec review: could someone implement a publisher from the doc alone?                     |
| 0.5 Conformance harness    | Golden fixtures for the 6 MVP bridge APIs + a Node harness that drives an arbitrary transport through them                                                                 | `pnpm conformance` runs against a mock host and passes                                   |

**Kill criterion**: if 0.3 fails on either platform after two sessions, the
architecture is wrong — stop and redesign (loopback server fallback) before
building anything else.

MVP bridge surface (freeze it here; additions are spec changes):
`storage.get/set/remove`, `ui.showToast`, `system.getInfo`, `navigation.close`,
`network.request`, plus host events `app.show/hide/destroy`.

## 6. Phase 1 — Runtime + CLI, browser-first (~8 sessions)

Goal: a mini-app developer's full local loop, no mobile involved.

| Task                           | Deliverable                                                                                                                    | Verified by                                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| 1.1 `@openmini/runtime`        | Bridge client (typed, promise-based, timeout + error model per spec), lifecycle events, `mini.*` facade                        | Unit tests + passes conformance fixtures against a mock transport                                                  |
| 1.2 Mock host                  | Browser bridge simulator implementing all fixtures (storage → localStorage, toast → DOM overlay)                               | Conformance suite green in a browser                                                                               |
| 1.3 `mini create` + `mini dev` | Scaffolds plain React+Vite app; dev server with mock bridge injected                                                           | `mini create todo && mini dev` shows a working app calling `mini.storage` in the browser                           |
| 1.4 `mini build` + `mini pack` | Vite build + `.mpkg` (zip) emission: manifest validation (JSON Schema), **CSP injection from `allowedDomains`**, `hashes.json` | `mini pack && mini inspect dist/todo.mpkg` validates; CSP visibly blocks an undeclared-domain fetch in browser dev |
| 1.5 Example app                | `examples/todo` exercising every MVP API                                                                                       | Doubles as the conformance smoke test                                                                              |

**Done when**: a stranger could build and package a mini-app without ever
touching a phone.

## 7. Phase 2 — Static registry + RN host SDK (~11 sessions)

The vertical slice. Two tracks:

**Registry (~3 sessions)**

- 2.1 `mini publish --registry ./dist-registry` (and any S3-compatible target): writes the static layout, updates `index.json`, records sha256.
- 2.2 Fetch/caching logic in the host SDK: resolve `latest` (or pinned version) → download → **verify hash** → cache → serve.
- Verified by: publish to a local static server (`npx serve`), fetch and verify from a Node test.

**RN host SDK (~8 sessions)**

- 2.3 Productionize the spike: `@openmini/react-native` with Kotlin/Swift WebView wrappers, scheme handler serving from the package cache.
- 2.4 Bridge host: JSON transport over the WebView message channel, implementing the 6 APIs. **Verified by: conformance suite green against the real RN host** (run via the playground + a driver script).
- 2.5 `<MiniAppView appId version registryUrl onClose onError>` + provider; loading/error UI.
- 2.6 Expo config plugin; CI check that an Expo dev build compiles.
- 2.7 Playground app opening the todo mini-app **by ID from the static registry**.

**Done when** (v0.1.0 release criteria):

```txt
mini create → mini dev → mini pack → mini publish (static)
→ RN playground opens the app by ID from the registry
→ conformance suite green against the RN host
→ works in an Expo dev build
→ CSP blocks undeclared domains; hashes verified on download
```

**Achieved 2026-07-09** — every criterion demonstrated on device (pre-release vertical-slice verification).

## 8. Phase 3 — LAUNCH GATE (~3 sessions, hard stop on building)

No new features past this point until the gate is evaluated.

1. README that earns the one-sentence pitch, 2-minute demo GIF, quickstart doc
   (target: **stranger to running mini-app in <15 minutes** — test it on a colleague).
2. `SECURITY.md`: trust model = trusted internal mini-apps; what's enforced
   (CSP, hashes, namespaced storage) vs shared (localStorage, WebView data store); isolation roadmap.
3. Publish v0.1.0 to npm. Post to r/reactnative, Show HN, RN newsletter.
   Personally recruit 3 developers to run the quickstart and watch them.

**Gates** (decided during the interview — hold yourself to them):

- Flutter SDK, registry server, signing: built **only on real pull** (an issue, a "does this work with Flutter?", a company asking about auth).
- After **two** distribution pushes with no bites: pivot review — reposition as portfolio/learning project and cut scope. Do not keep building breadth into silence.

## 9. Pull-gated backlog (build when asked, in order of likely pull)

| Item                             | Trigger                               | Notes                                                                                                                   |
| -------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Flutter host SDK                 | Anyone asks / Flutter-shop interest   | Port the bridge host; conformance suite is the spec. `webview_flutter` + same scheme-handler approach                   |
| Registry server                  | Enterprise-ish interest (auth, teams) | Node+Fastify+SQLite implementing the same registry protocol; adds tokens, channels (`dev/staging/prod`), `mini promote` |
| Package signing                  | Security-sensitive adopter            | Node crypto (ed25519) first; publisher keys in registry index                                                           |
| DX round 2                       | First real external mini-app devs     | Hot reload inside the host (`mini dev --host rn`), bridge call inspector, error overlay                                 |
| Storage/WebView isolation        | Multi-tenant hosts                    | Per-mini-app `WKWebsiteDataStore` / Android profiles — real native work, price it then                                  |
| Native components (camera, map…) | A host app that concretely needs one  | The original roadmap's Phase 8; still last, still hard                                                                  |

## 10. Risk register

| Risk                                                | Mitigation                                                                                                                                          |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scheme-handler serving fails or has platform quirks | Phase 0.3 spike is first; loopback-server fallback documented                                                                                       |
| CSP edge cases (inline styles, wasm, websockets)    | CSP built from a tested template; conformance fixture for the blocked-domain case                                                                   |
| Expo plugin churn across SDK versions               | CI matrix against current Expo SDK; plugin kept minimal                                                                                             |
| App Store review of downloaded code                 | Downloaded **web content in a WebView** is permitted (unlike native code injection); state this in docs; hosts remain responsible for their content |
| WebView cold-start feels slow vs native             | Pre-warm WebView, cache packages, measure; be honest in docs that this is a WebView runtime — that's the trade                                      |
| Solo burnout / stall                                | Session-sized tasks, `STATE.md`, hard launch gate at ~27 sessions in, pivot criteria written down                                                   |

## 11. Effort summary

~27 focused sessions (2–4h each) to the launch gate: Phase 0 ≈ 5, Phase 1 ≈ 8,
Phase 2 ≈ 11, Phase 3 ≈ 3. At a bursty pace that's a few months of real time —
which is exactly why the launch gate sits at the end of the vertical slice and
not after eight phases of breadth.
