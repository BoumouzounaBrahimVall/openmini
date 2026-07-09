# Bridge protocol — v1

The bridge is how a mini-app talks to its host. It is a JSON request/response
protocol over an opaque message channel. This spec is **host-framework
independent**: React Native, a browser mock, or any future host implements the
same contract. The conformance suite (`conformance/`) is this spec made
executable — where they disagree, fix one of them before writing code.

## 1. Transport contract

A transport is anything that can pass strings both ways:

- The mini-app side can `send(message: string)` to the host.
- The host can deliver `message: string` to a callback registered by the runtime.

How the channel is created (WebView message handlers, in-process function
calls in tests, etc.) is a **host binding** concern, documented per host
(`specs/webview-serving.md` for WebView hosts). Before the mini-app mounts,
the binding must also provide a **boot context**:

```ts
interface BootContext {
  appId: string; // manifest id
  appVersion: string; // manifest version
  initialPath?: string; // host-chosen entry route
  params?: Record<string, string>; // launch parameters from the host app
}
```

## 2. Message envelope

Every message is a single JSON object with a `v` (protocol version, currently
`1`) and a `type`. Unknown fields MUST be ignored; unknown `type` MUST be
ignored (forward compatibility).

**Call** (mini-app → host):

```json
{
  "v": 1,
  "type": "bridge.call",
  "id": "c-42",
  "api": "storage.get",
  "payload": { "key": "user" }
}
```

**Result** (host → mini-app):

```json
{
  "v": 1,
  "type": "bridge.result",
  "id": "c-42",
  "ok": true,
  "result": { "value": "abc" }
}
```

```json
{
  "v": 1,
  "type": "bridge.result",
  "id": "c-42",
  "ok": false,
  "error": {
    "code": "PERMISSION_DENIED",
    "message": "storage permission not declared"
  }
}
```

**Event** (host → mini-app, fire-and-forget, no reply):

```json
{ "v": 1, "type": "host.event", "event": "app.hide", "payload": {} }
```

## 3. Correlation, concurrency, timeouts

- `id` is any string unique among the caller's in-flight calls; the host MUST
  echo it verbatim. Exactly one `bridge.result` per `bridge.call`.
- Multiple calls may be in flight; results may arrive in any order.
- Timeouts are **client-side**: default 10 000 ms, overridable per call by the
  runtime API. On timeout the client rejects with `TIMEOUT` and MUST silently
  drop a late result for that id.
- A malformed incoming message (unparseable JSON, missing required fields) is
  dropped by either side; the host SHOULD log it.

## 4. Errors

`error` is `{ code, message, details? }`. `message` is developer-facing, never
shown raw to end users. `details` is an optional JSON object. Codes (closed
enum for v1):

| Code                     | Produced when                                                           |
| ------------------------ | ----------------------------------------------------------------------- |
| `PERMISSION_DENIED`      | API's permission not in manifest, or denied by host policy / OS prompt  |
| `API_NOT_FOUND`          | `api` is not implemented by this host                                   |
| `INVALID_PAYLOAD`        | Payload fails the shape rules of §5                                     |
| `NETWORK_DOMAIN_BLOCKED` | `network.request` to an origin not in manifest `allowedDomains`         |
| `HOST_ERROR`             | Host-side failure (I/O, quota, native exception) — details MAY say more |
| `TIMEOUT`                | Client-side only, see §3. Hosts never send it                           |

## 5. MVP API surface (frozen)

Built-in additions are spec changes first (new ticket). Host apps extend the
surface ONLY through the `host.*` passthrough (§5.1) — never by patching in
extra built-ins.
Permission column refers to manifest `permissions` (see `manifest.md`);
unlisted means always allowed.

| API                | Permission | Payload                                                                                                                                 | Result                                                             |
| ------------------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `storage.get`      | `storage`  | `{ key: string }`                                                                                                                       | `{ value: string \| null }`                                        |
| `storage.set`      | `storage`  | `{ key: string, value: string }`                                                                                                        | `null`                                                             |
| `storage.remove`   | `storage`  | `{ key: string }`                                                                                                                       | `null`                                                             |
| `ui.showToast`     | `toast`    | `{ message: string, durationMs?: number }`                                                                                              | `null`                                                             |
| `system.getInfo`   | —          | `{}`                                                                                                                                    | see below                                                          |
| `navigation.close` | —          | `{}`                                                                                                                                    | `null`                                                             |
| `network.request`  | `network`  | `{ url: string, method?: "GET"\|"POST"\|"PUT"\|"PATCH"\|"DELETE", headers?: Record<string,string>, body?: string, timeoutMs?: number }` | `{ status: number, headers: Record<string,string>, body: string }` |

`system.getInfo` result:

```ts
interface SystemInfo {
  platform: "ios" | "android" | "web";
  osVersion: string;
  hostSdkVersion: string; // host SDK package version
  bridgeVersion: 1; // protocol version of this spec
  locale: string; // BCP 47
  theme: "light" | "dark";
  screen: { width: number; height: number; scale: number }; // CSS px
  safeArea: { top: number; right: number; bottom: number; left: number };
}
```

Semantics:

- **storage** is namespaced by the host per `appId`; keys and values are
  strings; a missing key reads as `value: null`. Quota overrun → `HOST_ERROR`.
- **network.request** bodies are UTF-8 strings (binary is out of scope for v1).
  The host checks the URL's origin against `allowedDomains` BEFORE any I/O.
  Non-2xx HTTP statuses are still `ok: true` results — HTTP errors are data,
  not bridge errors.
- **navigation.close** asks the host to dismiss the mini-app; the host then
  emits `app.hide` and `app.destroy` as usual.

### 5.1 Host-defined APIs (`host.*`)

The `host.` namespace is reserved for APIs the host app registers itself —
this is how a super app shares its own data and actions (identity, session,
cart, native screens) with mini-apps without forking the protocol.

- **Name grammar**: `host.<name>` with `<name>` matching `[a-zA-Z][a-zA-Z0-9_-]*`.
- **Registration**: the host SDK exposes `customApis` at session setup
  (`<MiniAppProvider customApis={{ getUser: async (payload, ctx) => ... }}>`)
  and routes `host.getUser` to it. Built-ins can never be shadowed (separate
  namespace).
- **Permissions**: each name requires the manifest permission `host:<name>`
  (see `manifest.md`). Check order is fixed: `PERMISSION_DENIED` if
  undeclared, then `API_NOT_FOUND` if declared but unregistered.
- **Payloads/results**: any JSON — the contract is between the host app and
  its mini-apps; the host documents and validates it (Zod recommended
  host-side). The envelope, id correlation, timeout, and error rules of
  §2–§4 apply unchanged.
- **Custom events**: hosts may push `host.event` messages with event names
  `host.<name>` (same grammar); mini-apps subscribe via `mini.host.on(name, cb)`.
  The built-in event set in §6 stays frozen.
- **Conformance**: hosts supporting this capability register a test API
  `conformanceEcho` that returns its payload verbatim (see conformance/README).

## 6. Host events (frozen)

| Event         | Meaning                                                            |
| ------------- | ------------------------------------------------------------------ |
| `app.show`    | Mini-app became visible (initial mount included)                   |
| `app.hide`    | Mini-app hidden (backgrounded, covered, or closing)                |
| `app.destroy` | Teardown imminent; last message the app receives. Flush state now. |

Order guarantees: `app.show` fires before any other event after mount;
`app.destroy` is final. `payload` is `{}` for all three in v1.
