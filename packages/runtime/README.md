# @openmini/runtime

The mini-app side of [OpenMini](https://github.com/BoumouzounaBrahimVall/openmini):
a typed, **zero-dependency** client for the bridge a host embeds you in.

```sh
npm install @openmini/runtime
```

```ts
import { mini } from "@openmini/runtime";

await mini.storage.set("greeting", "hi");
await mini.ui.showToast({ message: "saved" });
const info = await mini.system.getInfo();
const data = await mini.host.invoke("getCart", { userId: "u1" }); // host-defined
```

- Full surface: [bridge API reference](../../docs/bridge-api.md)
- Wire protocol (source of truth): [specs/bridge-protocol.md](../../specs/bridge-protocol.md)
- Errors are typed: every rejection is a `BridgeError` with a closed `code` enum.

Apps created with `mini create` ([@openmini/cli](../cli/README.md)) come wired
already. For tests or custom bindings, `createMiniRuntime({ transport })`
builds an instance over any message channel.
