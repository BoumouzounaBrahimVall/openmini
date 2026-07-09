# @openmini/react-native

React Native host SDK for [OpenMini](../../README.md): render verified
mini-apps from a static registry with `<MiniAppProvider>` + `<MiniAppView>`.

```tsx
import { MiniAppProvider, MiniAppView } from "@openmini/react-native";

<MiniAppProvider registryUrl="https://miniapps.example.com">
  <MiniAppView appId="com.example.todo" onClose={() => nav.goBack()} />
</MiniAppProvider>;
```

## Install — bare React Native

1. `npm install @openmini/react-native`
2. Optional (persistent `mini.storage`): `npm install @react-native-async-storage/async-storage` and pass `storage={asyncStorageKv()}` to the provider.
3. iOS: `cd ios && pod install`
4. Rebuild the app (`npm run ios` / `npm run android`).

## Install — Expo (dev builds / prebuild)

1. `npx expo install @openmini/react-native`
2. Optional storage: `npx expo install @react-native-async-storage/async-storage`
3. Add the plugin to `app.json`: `"plugins": ["@openmini/react-native"]`
4. `npx expo prebuild`
5. `npx expo run:ios` / `npx expo run:android` (Expo Go is not supported — the SDK ships native code).

The config plugin currently applies no native modifications (autolinking
covers everything; the `openmini://` scheme is registered at WebView level,
not in Info.plist). Listing it anyway keeps your setup stable if a future
version needs prebuild-time config.

## Expose your own host APIs

Mini-apps call host superpowers as `mini.host.invoke(name, payload)` — you
register them with schemas, and requests are validated before your handler
runs (bad input reaches the mini-app as a typed `INVALID_PAYLOAD`):

```tsx
import { defineHostApi, MiniAppProvider } from "@openmini/react-native";
import { z } from "zod";

const getCart = defineHostApi({
  name: "getCart",
  request: z.object({ userId: z.string() }),
  response: z.object({ items: z.array(z.object({ sku: z.string() })) }),
  handler: ({ userId }) => ({ items: cartFor(userId) }), // fully typed
});

<MiniAppProvider registryUrl={url} customApis={[getCart]} />;
```

A mini-app must declare `host:getCart` in its manifest `permissions` to call
it. Response schemas are checked in dev builds only (zero production cost).

## How resolution works

`<MiniAppView appId ver>` resolves the app against the registry
([protocol](../../specs/registry-protocol.md)): fetch `index.json`, download
the package, **verify its sha256 against the index before extraction**, check
per-file hashes ([package format](../../specs/package-format.md)), cache
content-addressed, then serve it into a WebView over a private scheme with
the package's CSP enforced. Bridge behavior is pinned by the
[bridge protocol](../../specs/bridge-protocol.md) and the golden
[conformance suite](../../conformance) — which this host passes on-device.

More: [quickstart](../../docs/quickstart.md) ·
[bridge API reference](../../docs/bridge-api.md)
