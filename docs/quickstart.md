# Quickstart — zero to a running mini-app

Target: **under 15 minutes**, no cloud account, nothing to sign up for.

Prerequisites: Node ≥ 22, a React Native app (bare ≥ 0.76 or Expo ≥ SDK 54)
you can run on a simulator.

> **Pre-release note**: until `v0.1.0` lands on npm, run the CLI from this
> repo: `pnpm install && pnpm build`, then use
> `node <repo>/packages/cli/dist/bin.js` wherever the steps say `mini`.

## 1. Create a mini-app (2 min)

```sh
mini create hello
cd hello
```

You get a plain React + TypeScript app with a `manifest.json` — the only
OpenMini-specific file. It declares the app's id, permissions, and allowed
network origins:

```json
{
  "id": "com.example.hello",
  "permissions": ["storage", "toast"],
  "allowedDomains": []
}
```

## 2. Develop in the browser (3 min)

```sh
mini dev
```

Opens a dev server with a **browser mock host**: the full `mini.*` bridge
(storage, toasts, system info…) works without any mobile tooling. Edit
`src/App.tsx`, add a `mini.storage.set` call, watch it hot-reload.

## 3. Pack it (1 min)

```sh
mini pack
```

Produces `dist/hello-0.1.0.mpkg`: a deterministic, hash-manifested zip with a
Content-Security-Policy injected from your `allowedDomains`. `mini inspect
dist/hello-0.1.0.mpkg` shows what's inside.

## 4. Publish to a static registry (2 min)

```sh
mini publish --registry ./my-registry
npx serve my-registry            # any static file server works
```

That directory IS the registry — `index.json` (latest pointer) plus immutable
versioned packages. In production this is an S3 bucket or any CDN.

## 5. Open it in your app (5 min)

Install the host SDK ([full install steps](../packages/react-native/README.md),
including the Expo path):

```sh
npm install @openmini/react-native
cd ios && pod install && cd ..    # bare RN only
```

Render it:

```tsx
import { MiniAppProvider, MiniAppView } from "@openmini/react-native";

export function MiniAppScreen({ onBack }: { onBack: () => void }) {
  return (
    <MiniAppProvider registryUrl="http://localhost:3000">
      <MiniAppView appId="com.example.hello" onClose={onBack} />
    </MiniAppProvider>
  );
}
```

Simulator networking: iOS reaches `localhost` directly; on Android run
`adb reverse tcp:3000 tcp:3000` first.

Rebuild the app once (it gained a native module), open the screen — the
mini-app downloads, gets hash-verified, and renders.

## 6. Ship an update — no app release (2 min)

Bump `version` in `manifest.json`, then:

```sh
mini pack && mini publish --registry ./my-registry
```

Re-open the screen in the **same running app**: the host sees the new version
in `index.json`, verifies it, and renders it. That's the loop.

---

Next: [bridge API reference](bridge-api.md) ·
[expose your own host APIs](../packages/react-native/README.md) ·
[how verification works](../specs/package-format.md)
