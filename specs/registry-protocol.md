# Registry protocol — v1

An OpenMini registry is **a URL layout, not a server**. Anything that serves
static files over HTTPS — an S3 bucket, nginx, GitHub Pages, a CDN — is a
valid registry. `mini publish` writes this layout; host SDKs read it. The
future registry server (auth, channels UI — roadmap backlog) is one
implementation of this same protocol, never a replacement for it.

## 1. Layout

A registry is identified by a **base URL** (e.g. `https://apps.example.com/registry`).
All paths below are relative to it:

```txt
{base}/
└── {appId}/                      # manifest id, e.g. com.example.todo
    ├── index.json                # mutable: version index for this app
    └── {version}/                # exact SemVer, e.g. 0.1.1
        └── app.mpkg              # immutable: the package
```

- `{appId}` and `{version}` appear verbatim in paths — both are already
  URL-safe by their grammars (`manifest.md` §1).
- There is no registry-wide app listing in v1 (hosts know the appId they want).
  Adding one later (`{base}/index.json`) is a backward-compatible extension.

## 2. index.json

```json
{
  "registryVersion": 1,
  "id": "com.example.todo",
  "name": "Todo",
  "latest": "0.1.1",
  "channels": { "production": "0.1.1", "staging": "0.2.0-rc.1" },
  "versions": {
    "0.1.0": {
      "package": "0.1.0/app.mpkg",
      "sha256": "9f2b…",
      "size": 48211,
      "runtimeVersion": "0.1.0",
      "publishedAt": "2026-07-08T12:00:00Z"
    },
    "0.1.1": {
      "package": "0.1.1/app.mpkg",
      "sha256": "ab01…",
      "size": 48590,
      "runtimeVersion": "0.1.0",
      "publishedAt": "2026-07-08T15:30:00Z"
    }
  }
}
```

| Field                        | Required | Rules                                                                                                      |
| ---------------------------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| `registryVersion`            | yes      | Literal `1`; clients MUST refuse higher versions they don't know                                           |
| `id`, `name`                 | yes      | Copied from the manifest at publish time; `id` MUST match the path segment                                 |
| `latest`                     | yes      | A key of `versions`. THE pointer clients use for "latest" — clients never pick "highest SemVer" themselves |
| `channels`                   | no       | Map of channel name → version key. Unknown channel = not published there                                   |
| `versions[v].package`        | yes      | Path relative to `{base}/{appId}/`                                                                         |
| `versions[v].sha256`         | yes      | Lowercase hex SHA-256 of the `.mpkg` bytes (the package hash)                                              |
| `versions[v].size`           | yes      | Bytes of the `.mpkg` file as served                                                                        |
| `versions[v].runtimeVersion` | yes      | From the package's `hashes.json` — lets hosts skip incompatible downloads                                  |
| `versions[v].publishedAt`    | yes      | ISO 8601 UTC                                                                                               |

Unknown fields: ignored by clients (forward compatibility).

## 3. Client resolution and fetch flow

Given `(appId, ref)` where `ref` is an exact version, `"latest"`, or a channel
name:

1. `GET {base}/{appId}/index.json` — always revalidate (see §5).
2. Resolve `ref`: exact version → `versions[ref]`; `"latest"` → `versions[latest]`;
   otherwise → `versions[channels[ref]]`. No match → typed "not found" error.
3. Compatibility pre-check: compare entry `runtimeVersion` with the host's
   supported range (`manifest.md` §3) — fail BEFORE downloading.
4. `GET` the package. Verify its SHA-256 equals `sha256` **before extraction**;
   then follow the package verification chain (`package-format.md` §3).
5. Cache under `(appId, version, sha256)`. A cached entry whose hash was
   verified once needs no re-download; `"latest"`/channel refs only re-fetch
   `index.json` to learn the current pointer.

## 4. Publisher rules (`mini publish`)

1. Upload/write the package to its versioned path FIRST.
2. Then update `index.json` in a single atomic replace (fs: temp file +
   rename; S3: a PUT is atomic per object). Readers must never observe an
   index referencing a package that isn't fully present.
3. Versions are **immutable**: republishing an existing version is an error
   (`--force` exists for local/dev registries only, and never changes the
   sha256 silently — it replaces both file and index entry together).
4. Rollback = point `latest`/channel at an older version. Nothing is deleted.

## 5. HTTP serving requirements

| Path         | Cache-Control                         | Why                                   |
| ------------ | ------------------------------------- | ------------------------------------- |
| `index.json` | `no-cache` (or `max-age≤60`)          | It's the mutable pointer              |
| `*.mpkg`     | `public, max-age=31536000, immutable` | Content-addressed by the index sha256 |

- HTTPS required, except `http://localhost`/`127.0.0.1` for development
  (mirrors `manifest.md` allowedDomains rules).
- CORS: native hosts don't need it; enable `Access-Control-Allow-Origin` on
  the registry only if browser-based hosts will read it directly.
- Auth is out of scope for v1: whatever the file server provides (private
  bucket + signed URLs, basic auth, VPN) works unchanged, because clients
  only ever issue plain GETs.

## 6. Litmus test

Someone with only this document must be able to (a) publish with `aws s3 cp`
and a hand-written `index.json`, and (b) implement a fetching client — with
no access to OpenMini source code. Keep it that way.
