# {{APP_NAME}} — OpenMini mini-app

Instructions for AI coding agents (and humans) working in this project.

## What this is

An OpenMini mini-app: a plain React web app that talks to its host app
through the typed `mini.*` bridge from `@openmini/runtime`. It builds to
static files, is packaged as a `.mpkg`, and is distributed via a
static-file registry. There is no server code here, and no host-framework
code (React Native, Flutter, …) — the host is opaque behind `mini.*`.

## Check up-to-date docs before trusting memory

OpenMini is young and moves fast. Do NOT rely on trained-in knowledge of
its APIs — fetch the specs pinned to the SDK version this app was
scaffolded with before adding or changing any `mini.*` call, manifest
field, or packaging step:

- Bridge protocol (API surface, errors, events):
  https://github.com/BoumouzounaBrahimVall/openmini/blob/{{OPENMINI_DOCS_REF}}/specs/bridge-protocol.md
- Manifest:
  https://github.com/BoumouzounaBrahimVall/openmini/blob/{{OPENMINI_DOCS_REF}}/specs/manifest.md
- Package format (`.mpkg`):
  https://github.com/BoumouzounaBrahimVall/openmini/blob/{{OPENMINI_DOCS_REF}}/specs/package-format.md
- Registry protocol (publishing):
  https://github.com/BoumouzounaBrahimVall/openmini/blob/{{OPENMINI_DOCS_REF}}/specs/registry-protocol.md
- Latest docs (may be newer than this app's SDK):
  https://github.com/BoumouzounaBrahimVall/openmini#readme

## Commands

- `npx mini dev` (or `npm run dev`) — dev server with a browser mock host
- `npx mini build` — production-build to `dist/web`
- `npx mini pack` — build and package into `dist/<id>-<version>.mpkg`
- `npx mini inspect <file.mpkg>` — validate a package and print its summary
- `npx mini publish [package] --registry <dir | s3://bucket[/prefix]>` —
  publish to a registry

## Bridge surface (v1 — FROZEN)

The built-in surface is frozen: do NOT invent `mini.*` APIs. Anything not
listed here must go through host-defined APIs (`mini.host.*`) or an
upstream spec change.

| API                                                   | Manifest permission |
| ----------------------------------------------------- | ------------------- |
| `mini.storage.get/set/remove` — string KV, per-app    | `storage`           |
| `mini.ui.showToast({ message, durationMs? })`         | `toast`             |
| `mini.system.getInfo()` — platform, locale, theme, …  | —                   |
| `mini.navigation.close()` — ask host to dismiss app   | —                   |
| `mini.request({ url, method?, headers?, body?, … })`  | `network`           |
| `mini.host.invoke(name, payload?)` / `.on(name, cb)`  | `host:<name>`       |
| `mini.lifecycle.onLaunch/onShow/onHide/onDestroy(cb)` | —                   |

Failures reject with a `BridgeError` whose `code` is one of
`PERMISSION_DENIED`, `API_NOT_FOUND`, `INVALID_PAYLOAD`,
`NETWORK_DOMAIN_BLOCKED`, `HOST_ERROR`, `TIMEOUT`.

## Manifest (`manifest.json`)

The manifest gates the bridge: a permissioned API only works if listed in
`permissions`, and `mini.request` origins must be in `allowedDomains`
(checked before any I/O). This app's id is `{{APP_ID}}`. Full field rules
are in the manifest spec above.

## Rules of thumb

- Storage keys and values are strings — JSON-encode structured data.
- Non-2xx HTTP responses resolve normally; check `response.status`
  (HTTP errors are data, not bridge errors).
- `mini.lifecycle.onDestroy` is the last message the app receives — flush
  state there.
- Any React UI library is fine; the bridge doesn't care about rendering.
