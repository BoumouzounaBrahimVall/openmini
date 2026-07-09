# WebView serving — spike findings

Status: **VERIFIED on both platforms (2026-07-08)** — kill criterion passed; the scheme-handler architecture is confirmed (this doc is
updated with results and quirks as they're found; the production module hardens it into
the production binding spec).

## Chosen approach

Serve package files into the WebView from an **arbitrary local directory**
(the production package cache) via platform interception — no `file://`, no
loopback HTTP server:

|             | iOS                                                 | Android                                         |
| ----------- | --------------------------------------------------- | ----------------------------------------------- |
| Mechanism   | `WKURLSchemeHandler` on a custom scheme             | `WebViewAssetLoader` + `shouldInterceptRequest` |
| Page origin | `openmini://app/`                                   | `https://appassets.androidplatform.net/app/`    |
| JS → native | `WKScriptMessageHandler` (`webkit.messageHandlers`) | `addJavascriptInterface`                        |
| Native → JS | `evaluateJavaScript`                                | `evaluateJavascript`                            |

Note the asymmetry: Android's blessed pattern is not a literal custom scheme
but interception of a reserved `https://` domain — better for CSP `'self'`
semantics and cookie/storage behavior than custom schemes on Android. The
bridge spec doesn't care; the runtime must not assume a specific origin
scheme (it already doesn't — `bridge-protocol.md` §1).

## Spike implementation (apps/spike — throwaway)

- Bare RN 0.86 app; native test screen auto-presents over the RN shell.
- Test site is written to app storage at launch (iOS `Documents/spike-site`,
  Android `filesDir/spike-site`) and served from there — deliberately NOT from
  the app bundle/assets, to mirror the production cache-dir case.
- Four on-screen checks, each PASS/FAIL: (1) served via scheme/loader origin,
  (2) CSS asset loads, (3) relative `fetch("./data.json")` resolves,
  (4) JS→native→JS echo round-trip.
- Path-traversal guard in both handlers (resolved path must stay under the
  site root); `allowFileAccess=false` on Android; `isInspectable` (iOS) and
  `setWebContentsDebuggingEnabled` (Android) for debugging.

## Constraints for the production module

- iOS: `WKURLSchemeHandler` must stream large files (`didReceive` chunks)
  rather than loading whole files into memory; MIME map must cover everything
  a bundler emits (wasm, woff2, source maps).
- Android: `InternalStoragePathHandler` requires the directory under the app
  data dir — the package cache must live there.
- Custom-scheme fetch on iOS needed `Access-Control-Allow-Origin: *` on
  responses in past WebKit versions; the spike sets it — verify whether it's
  still required and record.
- CSP `'self'`: verify it matches `openmini://app` (iOS) and the asset-loader
  origin (Android) — the CLI build template assumes it does.

## Verification results

_To be filled after simulator runs:_

- [x] iOS simulator: all 4 checks PASS (2026-07-08, iPhone 17e, iOS 26.5 — origin `openmini://app/index.html`, css, relative fetch, native echo all green; sheet swipe-dismiss returns to host. Evidence: [screenshot](./assets/spike-03-ios-pass.png))
- [x] Android: all 4 checks PASS (2026-07-08, physical Samsung device — scheme serving via appassets.androidplatform.net, css, relative fetch, native echo all green; back button returns to host. Evidence: [screenshot](./assets/spike-03-android-pass.jpg))
- Quirks encountered: Metro "r" reload only refreshes the RN shell — the spike WebView is a native Activity outside RN, relaunch to re-run checks (expected; production component will be RN-managed). React Native DevTools warning at launch is unrelated to the WebView. Environment note: Xcode 26.x refuses ALL simulator destinations until its exact matching runtime build is installed (26.6 wanted 23F77; the Components UI had delivered 23F73) — fix is `xcodebuild -downloadPlatform iOS`; worth a docs FAQ entry when hosts hit it.

Kill criterion (ROADMAP §5): if either platform can't pass after 2 sessions,
stop and switch to the loopback-server fallback before any Phase 1+ work.

## JS global binding contract (all hosts + dev server)

`@openmini/runtime`'s `mini` singleton connects to it,
so every host binding — the `mini dev` Vite plugin today, the native
WebView injection next — MUST provide, before app code runs:

| Global                   | Direction  | Contract                                                                                                                                                                                                         |
| ------------------------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `__OPENMINI_HOST__`      | app → host | `{ postMessage(raw: string): void }`                                                                                                                                                                             |
| `__OPENMINI_ONMESSAGE__` | host → app | Assignable callback. The host MUST buffer messages until it is assigned, then flush **on a microtask** in order (the runtime assigns it during connect, before the caller's listeners register in the same turn) |
| `__OPENMINI_BOOT__`      | host → app | `BootContext` (`bridge-protocol.md` §1)                                                                                                                                                                          |

Reference implementation: `packages/cli/src/dev-host/globals.ts`
(`wireDevGlobals`). The native module injects the equivalent from native code.

## Production module

`@openmini/react-native` ships the productionized layer:

- **OpenMiniWebView** (embedded view, never self-presents — user decision
  2026-07-09): `packagePath` + `entry` + `bootstrapScript` props,
  `onBridgeMessage` event up, `postMessage` command down
  (`window.__openminiDeliver`). The bootstrap script is BUILT IN TYPESCRIPT
  (`buildBootstrapScript`) and injected by both platforms — one testable
  source of truth for the binding contract, no Swift/Kotlin copy drift.
  iOS injects via WKUserScript atDocumentStart; Android via
  WebViewCompat.addDocumentStartJavaScript (DOCUMENT_START_SCRIPT feature)
  with an onPageStarted best-effort fallback.
- **Scheme serving**: iOS WKURLSchemeHandler streams files in 1 MiB chunks
  with a MIME map covering bundler outputs (wasm, woff2, maps) and a
  path-traversal guard; Android uses InternalStoragePathHandler (canonical
  child checks built in). 404s answer cleanly.
- **OpenMiniFiles** module: native FileStore/Hasher adapters for the resolver
  ports (cache dir, exists/readText/writeFileBase64/rename/removeDir,
  CryptoKit/MessageDigest sha256).
- **Playground** (`apps/playground`): full-screen page with a 5-check site
  (scheme, css, relative fetch, traversal guard, bridge echo) installed
  through OpenMiniFiles — verifying module + serving + channel together.

## Production verification (2026-07-09)

- **Android (emulator)**: 5/5 PASS — scheme via appassets.androidplatform.net,
  css, relative fetch, traversal guard, bridge echo (both directions through
  the production channel + TS-built bootstrap).
- **iOS (iPhone 17e sim)**: 5/5 PASS after the bridgeless fix — the legacy
  NativeModules/bridge.uiManager downlink does NOT exist under RN's bridgeless
  new architecture; postMessage now uses UIManager.dispatchViewManagerCommand
  on both platforms + a weak instance registry on iOS. Record this pattern for
  any future native module work.
- Traversal responses normalized: iOS answered 404 (we are the server);
  Android originally declined interception and the request leaked to the
  network ("request refused"). Unhandled paths on the serving domain now
  answer 404 on Android too — no network fallback on our origin.
- Monorepo dev quirks (playground only, not shipped): metro needs the
  singletons (react/react-native/@babel/runtime) pinned to the app copy via
  resolveRequest, or the workspace's dev React causes "useRef of null".
