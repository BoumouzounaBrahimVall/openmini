# OpenMini

Open-source, self-hosted mini-app runtime for React Native host apps.
Mini-apps are plain React web apps + a typed `mini.*` bridge SDK, packaged as
`.mpkg` files, distributed via a static-file registry protocol.

Pitch: _Portals, but open-source — and your registry is an S3 bucket._

## The invariant (do not break)

The package format, manifest, bridge protocol, and registry protocol are
**host-framework independent**. React Native is just the first host adapter.
Nothing in `packages/runtime`, `specs/`, or `conformance/` may reference RN,
Flutter, or any host.

## Layout

- `packages/runtime` — mini-app-side SDK (bridge client, lifecycle, `mini.*`)
- `packages/cli` — `mini create/dev/build/pack/publish/inspect`
- `packages/react-native` — host SDK (resolver, native WebView, bridge host)
- `conformance/` — golden bridge fixtures + harness; ANY host must pass it
- `specs/` — bridge-protocol, manifest, package-format, registry-protocol.
  **Specs are the source of truth**: change the spec before the code.
- `ROADMAP.md` — phases, locked decisions, risk register.

## Commands

`pnpm build` · `pnpm test` (vitest, repo-wide) · `pnpm lint` · `pnpm format`

## Working rules

- The v0.1 bridge surface is frozen (6 built-in APIs + 3 host events) plus
  the `host.*` passthrough for host-defined APIs (bridge-protocol §5.1).
  Built-in additions are spec changes first.
- Hexagonal architecture is law: dependencies point inward, all side effects
  behind ports, one composition root per package — see `specs/architecture.md`.
  Validation strategy (JSON Schema vs Zod vs zero-dep guards) is defined there too.
- Every change ends verified: build, tests, lint, format all green before commit.
