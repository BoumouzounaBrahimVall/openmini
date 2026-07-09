# Bridge API reference (`mini.*`)

The mini-app side of the bridge, from `@openmini/runtime`:

```ts
import { mini } from "@openmini/runtime";
```

Every call returns a Promise that **resolves** with the result or **rejects**
with a `BridgeError` carrying a typed `code` (see [errors](#errors)). The
wire protocol behind it is [specs/bridge-protocol.md](../specs/bridge-protocol.md)
— the v0.1 surface below is frozen; new built-ins are spec changes first.

Calls gated by a permission require it in the app's `manifest.json`
(`permissions: [...]`), or they reject with `PERMISSION_DENIED`.

## Storage — permission `storage`

Per-app key-value strings. The host namespaces every key by app id — two
mini-apps can never read each other's data through the bridge.

```ts
await mini.storage.set("todos", JSON.stringify(todos));
const raw = await mini.storage.get("todos"); // string | null
await mini.storage.remove("todos");
```

## Toast — permission `toast`

```ts
await mini.ui.showToast({ message: "Saved", durationMs: 1500 }); // durationMs optional (default 3000)
```

## System info — no permission

```ts
const info = await mini.system.getInfo();
// { platform: "ios" | "android" | "web", osVersion, hostSdkVersion,
//   bridgeVersion, locale, theme: "light" | "dark",
//   screen: { width, height, scale }, safeArea: { top, right, bottom, left } }
```

## Network — permission `network`

Fetch through the host. The URL's origin must be listed in the manifest's
`allowedDomains`, or the call rejects with `NETWORK_DOMAIN_BLOCKED` before any
I/O. (Direct `fetch()` from the page is additionally constrained by the
package's build-time CSP — same allow-list.)

```ts
const res = await mini.request({
  url: "https://api.example.com/items", // origin must be allow-listed
  method: "POST", // default GET
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ q: 1 }),
  timeoutMs: 5000,
});
// { status: number, headers: Record<string, string>, body: string }
// HTTP errors are DATA (resolve with status 4xx/5xx), not rejections.
```

## Navigation — no permission

```ts
await mini.navigation.close(); // host decides what closing means (e.g. pop the screen)
```

## Host-defined APIs — permission `host:<name>`

The host app can expose its own APIs
([`defineHostApi`](../packages/react-native/README.md)); the mini-app calls
them by bare name and must declare `host:<name>` in its manifest:

```ts
const cart = await mini.host.invoke<{ items: Item[] }>("getCart", { userId });
const off = mini.host.on("cartUpdated", (payload) => {
  /* host-pushed event */
});
```

## Lifecycle

```ts
mini.lifecycle.onLaunch((boot) => {
  // boot: { appId, appVersion, initialPath?, params? }
});
const off = mini.lifecycle.onShow(() => {}); // returns unsubscribe
mini.lifecycle.onHide(() => {});
mini.lifecycle.onDestroy(() => {}); // teardown imminent — flush state now
```

`app.show` fires after mount before anything else; `app.destroy` is the last
message the app ever receives.

## Errors

```ts
import { BridgeError } from "@openmini/runtime";

try {
  await mini.request({ url });
} catch (e) {
  if (e instanceof BridgeError) console.log(e.code, e.message);
}
```

| Code                     | Meaning                                                  |
| ------------------------ | -------------------------------------------------------- |
| `PERMISSION_DENIED`      | Manifest doesn't declare the permission this call needs  |
| `API_NOT_FOUND`          | Unknown API, or `host.*` name the host didn't register   |
| `INVALID_PAYLOAD`        | Payload failed the host's validation                     |
| `NETWORK_DOMAIN_BLOCKED` | URL origin not in `allowedDomains`                       |
| `HOST_ERROR`             | The host handler threw                                   |
| `TIMEOUT`                | No reply in time (client-side; late replies are dropped) |

The enum is closed: hosts map every failure onto one of these six.
