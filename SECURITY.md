# Security

OpenMini's trust model, stated plainly: **mini-apps are trusted code**. The
system is built for your own teams and partners shipping into your app —
not for running arbitrary third-party code. Every claim below links to the
test or check that enforces it; where something is _not_ enforced, this
document says so instead of implying otherwise.

## Trust model

The security boundary is **write access to your registry**. Anyone who can
write `index.json` and packages to your registry can run code inside your
app's WebView. Protect the registry like you protect your app's release
pipeline — because that's what it is.

Consequences:

- **Do not run untrusted mini-apps.** Isolation between mini-apps inside one
  host is partial (see [Not enforced](#not-enforced-shared-state)).
- Packages are **integrity-verified, not signed**. Hash verification proves
  the package matches what the registry index says — it does not prove _who_
  published it. If your registry (or the TLS path to it) is compromised, the
  attacker controls both package and index. Publisher signing is
  [pull-gated on the roadmap](ROADMAP.md).

## Enforced — and the test that proves it

| Guarantee                                       | Mechanism                                                                                                          | Proof                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package integrity checked **before extraction** | sha256 of the downloaded `.mpkg` compared to the registry index; mismatch → typed `HASH_MISMATCH`, nothing written | [`resolver.test.ts`](packages/react-native/src/resolver.test.ts) ("hash mismatch: rejected, cache untouched"); reproduced on-device by tampering the served package (pre-release verification, 2026-07)                                                                                                                      |
| Per-file integrity                              | every extracted file re-hashed against the package's `hashes.json`                                                 | [`resolver.test.ts`](packages/react-native/src/resolver.test.ts) ("corrupt archive with a matching sha: BAD_PACKAGE")                                                                                                                                                                                                        |
| Archive path traversal rejected                 | entry names with `..`/absolute/drive paths refuse the whole package                                                | [`resolver.test.ts`](packages/react-native/src/resolver.test.ts) ("path traversal in the archive")                                                                                                                                                                                                                           |
| Serving traversal-safe                          | WebView scheme handlers answer 404 outside the package dir (both platforms)                                        | playground native-module checks ([spec record](specs/webview-serving.md))                                                                                                                                                                                                                                                    |
| Network allow-list, in the page                 | build-time CSP `connect-src 'self' {allowedDomains}` injected into the package                                     | CSP template drift-tested against the spec ([`csp.spec-sync.test.ts`](packages/cli/src/domain/csp.spec-sync.test.ts)); on-device: page fetch to an undeclared origin refused with a CSP violation (pre-release on-device verification)                                                                                       |
| Network allow-list, on the bridge               | `mini.request` checks the URL origin against `allowedDomains` **before any I/O** → `NETWORK_DOMAIN_BLOCKED`        | conformance fixture [`network-request.json`](conformance/fixtures/network-request.json), run against every host — including on-device                                                                                                                                                                                        |
| Capability permissions                          | every gated API checks the manifest's `permissions`; `host.*` APIs check `host:<name>` before registration lookup  | conformance fixtures ([`storage`](conformance/fixtures/storage.json), [`ui-toast`](conformance/fixtures/ui-toast.json), [`host-custom`](conformance/fixtures/host-custom.json)); [`vertical-slice.e2e.test.ts`](packages/react-native/src/vertical-slice.e2e.test.ts) proves the gate uses the _resolved, verified_ manifest |
| Bridge storage namespaced per app               | host prefixes every key `openmini:<appId>:` — no cross-app reads through the bridge                                | [`bridge-host.test.ts`](packages/react-native/src/usecases/bridge-host.test.ts) ("namespaces storage by appId over a SHARED backing store"); on-device isolation check in the playground conformance screen                                                                                                                  |
| Closed error surface                            | hosts map all failures to six typed codes; malformed bridge messages are dropped, never executed                   | [`envelope.json`](conformance/fixtures/envelope.json) fixture                                                                                                                                                                                                                                                                |

The conformance suite (the golden fixtures above) has passed **on-device**
against the React Native host — 24/24, nothing skipped — on the iOS
simulator and Android emulator during pre-release verification (2026-07),
and re-run on Android after later host changes. It also runs
in CI on every push, host logic driven with in-memory adapters.

## NOT enforced (shared state)

Inside one host app, mini-apps currently **share the WebView data store**:

- `localStorage`, `IndexedDB`, cookies, and HTTP caches are per data store,
  not per mini-app. A mini-app can read what another left there.
- Only `mini.storage` (the bridge API) is namespaced and isolated.
- There is no process/JS isolation between mini-apps beyond one WebView per
  `<MiniAppView>`.

This is the main reason the trust model is "trusted mini-apps only". Real
per-app isolation (`WKWebsiteDataStore` per app id, Android profiles) is
[pull-gated on the roadmap](ROADMAP.md) — it lands when a multi-tenant use
case actually asks for it.

Also not enforced today:

- **Package signing** (see trust model above).
- **Registry authentication** — a static server serves whoever can reach it;
  use your CDN's access controls.
- **Downgrade protection.** Rollback is a _supported_ registry operation
  (point `latest` at an older version — [registry protocol](specs/registry-protocol.md)),
  and hosts tracking `latest` follow the index wherever it points: there is
  no "highest version seen" check. A stale CDN edge or an accidental
  registry rollback can serve an older, still-hash-valid version. Pin exact
  versions in `<MiniAppView version>` where that matters.
- **Rate limiting.**

## Reporting a vulnerability

Use **GitHub private vulnerability reporting**: this repository's
**Security tab → "Report a vulnerability"**
(`https://github.com/BoumouzounaBrahimVall/openmini/security/advisories/new`).
If you can't, open a plain issue saying "security —
requesting a private channel" without details, and a maintainer will follow
up. Expect an acknowledgment within a week.

Please include: the spec section or file affected, reproduction steps, and
impact under the trust model above (a finding that requires a hostile
mini-app is still worth reporting — it informs the isolation roadmap — but
is not treated as a breach of a stated guarantee).
