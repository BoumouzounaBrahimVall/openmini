# Limitations — what the WebView architecture can and can't do

Read this before adopting. OpenMini mini-apps are web apps in a WebView with
a typed bridge. That architecture makes a whole class of things easy and one
class genuinely hard — knowing which is which up front saves you a
disappointed GitHub issue later.

## The two different problems

People say "mini-apps can't do native things" as if it were one problem.
It's two, with very different costs:

**1. Request/response native APIs** — camera _capture_, GPS position, file
picker, share sheet, biometric prompt, contacts. The mini-app asks, the host
does something native, a JSON result comes back. This is exactly how
WeChat's `wx.*` APIs work, and OpenMini's bridge already has the shape for
it: it's what [`mini.host.invoke`](bridge-api.md#host-defined-apis--permission-hostname)
does today. **You can add any of these to your own host right now** with
[`defineHostApi`](../packages/react-native/README.md#expose-your-own-host-apis)
— e.g. a `scanQr` handler that presents a native scanner full-screen and
resolves with the decoded string. Built-in, spec'd versions are
[pull-gated on the roadmap](../ROADMAP.md) ("Native API expansion");
they're gated on demand, not on architecture.

**2. Rendered native surfaces** — a native map _inside_ the mini-app's
layout, camera _preview_, inline native video. These need native views
composited into web content ("same-layer rendering" in the WeChat world,
where it took a custom renderer to do well). This is the genuinely hard
class. It's [pull-gated on the roadmap](../ROADMAP.md) ("Native components")
— it gets built when a real adopter needs it, and priced honestly then.

## Capability matrix

| Capability                                              | Status                                                                                                                |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Storage, toast, system info, close, HTTP (allow-listed) | **Today** — the six built-in bridge APIs, conformance-tested on device                                                |
| Anything your host app can do, request/response style   | **Today** — `defineHostApi` + `mini.host.invoke` (typed, schema-validated)                                            |
| Camera capture, GPS, share, file picker, biometrics     | **Bridge-addable** — same mechanism; built-ins tracked in the [roadmap backlog](../ROADMAP.md)                        |
| `getUserMedia` (camera/mic inside the WebView page)     | **Not wired in v0.1** — the host WebView doesn't grant media permission requests yet; use a host API takeover instead |
| Native maps, camera preview, inline video surfaces      | **Gated roadmap** — the [roadmap backlog](../ROADMAP.md); needs same-layer rendering work                             |
| Push notifications, background execution                | **Host's job** — mini-apps only run while presented; hand off to the host via custom APIs                             |

## Patterns that work today

- **Maps without native maps**: WebGL renderers — [MapLibre GL JS](https://maplibre.org/)
  or Mapbox GL JS — run inside the WebView. Realistic framing: smooth for
  store locators, delivery tracking, dashboards with a few hundred markers;
  not for turn-by-turn navigation or heavy vector animation on old Android
  hardware. Declare your tile server in `allowedDomains`.
- **QR/document scanning**: full-screen native takeover. The mini-app calls
  `mini.host.invoke("scanQr")`; the host presents its native scanner over the
  WebView and resolves with the result. Cheap to build, feels fully native,
  no rendering integration needed. This pattern covers most "we need the
  camera" asks.
- **Media capture**: same takeover pattern (host presents the native camera
  UI, returns a file path or base64). Don't rely on `getUserMedia` in v0.1 —
  see the matrix.

## Use-case fit

**Strong fit**: commerce checkouts, forms and workflows, content/help
centers, dashboards, account management, seasonal campaigns — anything a
good responsive web app does, plus OTA updates and host superpowers.

**Not yet**: maps-_centric_ products (the map IS the app), live-media apps
(video calls, streaming with camera effects), and game-like experiences
chasing 60fps animation. That's rendered-surface territory —
the [roadmap backlog](../ROADMAP.md) — and
pretending otherwise would just move the disappointment from this doc to
your users.

## Performance expectations

A mini-app feels like a **fast website inside your app, not like a native
screen**. Concretely:

- **First open** downloads and hash-verifies the package — network-dependent
  (keep packages small; the example todo app is ~200 KB). After that the
  package is cached content-addressed: **subsequent opens load from disk**.
- WebView startup adds real milliseconds; animations and long lists obey web
  rules, not UIKit/Compose ones.
- Mitigations that exist today: version pinning (zero network on open),
  small bundles, standard web perf discipline. Pre-warming WebViews and
  background prefetch are known techniques on the
  [roadmap's radar](../ROADMAP.md) — not shipped, so don't budget for them.

## How this compares to WeChat mini-programs

WeChat runs a dual-thread model (logic in a JS VM, rendering in WebViews),
a native page stack per screen, and same-layer rendering for maps/video —
backed by hundreds of engineers and a proprietary DSL. OpenMini deliberately
trades that ceiling for: plain React, an open package format you can audit,
and a registry that's just your file server. The bridge API surface is the
part where the models genuinely meet — request/response native access —
and that's the part OpenMini ships first.
