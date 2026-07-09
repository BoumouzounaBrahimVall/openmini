# Manifest — v1

Every mini-app ships a `manifest.json` at the package root. It is the single
place a host looks to decide **what this app is, whether it can run here, and
what it is allowed to do**. Host-framework independent.

## 1. Fields

```json
{
  "manifestVersion": 1,
  "id": "com.example.todo",
  "name": "Todo",
  "version": "0.1.0",
  "runtimeVersion": ">=0.1.0 <1.0.0",
  "entry": "index.html",
  "permissions": ["storage", "network", "toast"],
  "allowedDomains": ["https://api.example.com"],
  "description": "Optional one-liner shown in registry UIs",
  "icon": "assets/icon.png"
}
```

| Field             | Required | Rules                                                                                        |
| ----------------- | -------- | -------------------------------------------------------------------------------------------- |
| `manifestVersion` | yes      | Literal `1`. Hosts MUST refuse manifests with a higher version they don't know               |
| `id`              | yes      | Reverse-DNS, `^[a-z0-9]+(\.[a-z0-9-]+)+$`, ≤128 chars. Identity for registry, cache, storage |
| `name`            | yes      | Human-readable, 1–64 chars                                                                   |
| `version`         | yes      | Exact SemVer 2.0.0 (`x.y.z`, optional pre-release)                                           |
| `runtimeVersion`  | yes      | SemVer **range** the app requires of `@openmini/runtime`. Host refuses to load on mismatch   |
| `entry`           | no       | Package-relative path to the entry document. Default `index.html`                            |
| `permissions`     | no       | Built-in enum plus `host:<name>` entries for host-defined APIs (§2.1). Default `[]`          |
| `allowedDomains`  | no       | Origins the app may reach via `network.request`. Default `[]` (no network)                   |
| `description`     | no       | ≤256 chars                                                                                   |
| `icon`            | no       | Package-relative path to a PNG                                                               |

Unknown top-level fields: **rejected** by `mini pack` (catch typos at build
time), **ignored** by hosts (a v1 host must tolerate future minor additions).

## 2. `allowedDomains` semantics

- Each entry is an **origin**: scheme + host [+ port]. No paths, no wildcards
  in v1. `https:` only, except `http://localhost[:port]` and
  `http://127.0.0.1[:port]` for development.
- Matching is exact-origin: `https://api.example.com` does not authorize
  `https://sub.api.example.com` nor port variants.
- Consumed in two places, which MUST stay in sync:
  1. **Pack time**: `mini pack` derives the CSP `connect-src` list injected
     into the entry document (see `package-format.md` §4) — this is what
     actually blocks a raw `fetch()` in the WebView.
  2. **Call time**: the host checks `network.request` URLs against the list
     and rejects with `NETWORK_DOMAIN_BLOCKED` (bridge traffic bypasses CSP,
     so the host must enforce it too).
- Honesty rule (decision #7): docs never claim isolation beyond these two
  mechanisms. `permissions` gates bridge APIs only.

### 2.1 Host-defined API permissions (`host:<name>`)

A permission entry `host:<name>` grants access to the host-defined bridge API
`host.<name>` (bridge-protocol §5.1). Explicit per-name entries keep host data
sharing reviewable — a mini-app cannot call `host.getUser` without declaring
`host:getUser`. Undeclared → `PERMISSION_DENIED`; declared but not registered
by this host → `API_NOT_FOUND`.

## 3. `runtimeVersion` check

The host compares the range against the `@openmini/runtime` version bundled in
the package (recorded at pack time, see `package-format.md` §3) and against its
own supported `bridgeVersion`. On incompatibility the host MUST fail the load
with a typed error before any app code runs — never degrade silently.

## 4. JSON Schema

Validation at `mini pack`, `mini inspect`, dev-server start, and host load.
Canonical schema (draft 2020-12):

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "additionalProperties": false,
  "required": ["manifestVersion", "id", "name", "version", "runtimeVersion"],
  "properties": {
    "manifestVersion": { "const": 1 },
    "id": {
      "type": "string",
      "pattern": "^[a-z0-9]+(\\.[a-z0-9-]+)+$",
      "maxLength": 128
    },
    "name": { "type": "string", "minLength": 1, "maxLength": 64 },
    "version": {
      "type": "string",
      "pattern": "^\\d+\\.\\d+\\.\\d+(-[0-9A-Za-z-.]+)?$"
    },
    "runtimeVersion": { "type": "string", "minLength": 1 },
    "entry": {
      "type": "string",
      "pattern": "^[^/].*",
      "default": "index.html"
    },
    "permissions": {
      "type": "array",
      "uniqueItems": true,
      "items": {
        "anyOf": [
          { "enum": ["storage", "network", "toast"] },
          { "type": "string", "pattern": "^host:[a-zA-Z][a-zA-Z0-9_-]*$" }
        ]
      },
      "default": []
    },
    "allowedDomains": {
      "type": "array",
      "uniqueItems": true,
      "items": {
        "type": "string",
        "pattern": "^https://[^/]+$|^http://(localhost|127\\.0\\.0\\.1)(:\\d+)?$"
      },
      "default": []
    },
    "description": { "type": "string", "maxLength": 256 },
    "icon": { "type": "string", "pattern": "^[^/].*" }
  }
}
```

(`runtimeVersion` range syntax is validated by the semver library at pack
time — a regex can't express it.)
