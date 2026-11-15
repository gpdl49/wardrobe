# Wardrobe iOS: API contract

The contract between the native iOS client (`ios/`) and the Wardrobe server.
It extends, and never contradicts, the build contract in
[`docs/wardrobe.md` in gpdl49/homestacks](https://github.com/gpdl49/homestacks/blob/main/docs/wardrobe.md)
("Interfaces"), whose "Native iOS client" section carries the server-side and
infrastructure half of this document. Change both together.

The HTTP API itself is unchanged: the app uses exactly the endpoints, bodies,
rules and error codes the web client uses. Sources of truth, in order:

1. `docs/wardrobe.md` (homestacks) "HTTP API" and "Rules".
2. `lib/api/types.ts`: response shapes. The Swift models in
   `ios/Packages/WardrobeKit/Sources/WardrobeKit/Models/` mirror it field for
   field; when it changes, change the Swift models in the same PR.
3. `lib/<feature>/schema.ts`: request bodies and query parameters (zod).

## Names

| Thing | Value |
|-------|-------|
| Bundle ID | `xyz.vidur.wardrobe` |
| App name | Wardrobe |
| Apple team | `2J2LYH5QBS` (Individual, Vidur Butalia) |
| App ID (team + bundle) | `2J2LYH5QBS.xyz.vidur.wardrobe` |
| Devices | iPhone and iPad (`TARGETED_DEVICE_FAMILY = 1,2`), all orientations on iPad, portrait on iPhone |
| Minimum iOS | 26.0 |
| Toolchain | Xcode 27, Swift 6 language mode, strict concurrency; no third-party Swift packages |
| API base URL | `https://wardrobe.vidur.xyz` (build setting `WARDROBE_BASE_URL`, Info.plist key `WardrobeBaseURL`) |
| OIDC issuer | `https://z.vidur.xyz` (build setting `WARDROBE_OIDC_ISSUER`, Info.plist `WardrobeOIDCIssuer`) |
| OIDC client | Zitadel app `wardrobe-ios`, native, PKCE, no secret. Its client ID is the build setting `WARDROBE_OIDC_CLIENT_ID` (Info.plist `WardrobeOIDCClientID`), supplied in CI by the GitHub Actions variable `IOS_OIDC_CLIENT_ID` |
| Redirect URI | `xyz.vidur.wardrobe://oauth/callback` |
| Post-logout redirect | `xyz.vidur.wardrobe://oauth/logout` |
| Scopes | `openid email profile offline_access` |
| Universal links | `applinks:wardrobe.vidur.xyz`, paths `/l/*` |
| URL scheme (deep links) | `xyz.vidur.wardrobe` (also the OAuth callback scheme) |

## Authentication

The app signs in with Zitadel directly (authorization code + PKCE S256,
`ASWebAuthenticationSession`, `prefersEphemeralWebBrowserSession = false` so
an existing Zitadel browser session is reused) and calls the API with
`Authorization: Bearer <id_token>`.

Why the ID token: oauth2-proxy in front of the app verifies a bearer JWT with
its OIDC provider (`OAUTH2_PROXY_SKIP_JWT_BEARER_TOKENS=true`), accepting the
`wardrobe-ios` client ID as an extra audience
(`OAUTH2_PROXY_OIDC_EXTRA_AUDIENCES`). It builds the session from the token's
claims (`sub`, `email`, `preferred_username`, `groups`), checks
`ALLOWED_GROUPS`, and passes the same `X-Forwarded-*` headers the app already
trusts. Zitadel puts the userinfo claims and the `groups` claim in the ID
token (`idTokenUserinfoAssertion`, groups-claim action). So the app server
needs no auth change, and the web and native clients produce identical users.

Client rules:

- **Discovery**: `GET {issuer}/.well-known/openid-configuration` for
  `authorization_endpoint`, `token_endpoint`, `end_session_endpoint`; cache it
  for the process lifetime.
- **Tokens** (`id_token`, `refresh_token`, `expires_at` from the ID token's
  `exp`) live in the Keychain (`kSecClassGenericPassword`, service
  `xyz.vidur.wardrobe.auth`, `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`).
  The access token is not used and not stored.
- **Refresh**: before a request, if the ID token expires in under 5 minutes,
  refresh with `grant_type=refresh_token`. Refreshes are single-flight (one in
  progress at a time; concurrent requests await it). Zitadel rotates refresh
  tokens: always store the new one.
- **Auth failures**: a 401, a 403 whose body is not the API's JSON error
  shape (oauth2-proxy rejecting the JWT), or any 3xx to a URL whose path starts
  with `/oauth2/` means the token was refused. Refresh once and retry the
  request once; if it fails again, or the refresh fails with
  `invalid_grant`, the session is over: clear the Keychain and show sign-in.
  A 403 with a JSON `{error, message}` body is the API's own "forbidden"
  (view access on a write) and is never retried.
- **Group check**: after sign-in the app calls `GET /api/me`. A 403 there
  (JSON `forbidden`) means the user lacks the `wardrobe` role: show "Your
  Centerpoint account doesn't have access to Wardrobe" and a sign-out button.
- **Sign-out**: open `end_session_endpoint?id_token_hint=…&client_id=…&post_logout_redirect_uri=xyz.vidur.wardrobe://oauth/logout`
  in an `ASWebAuthenticationSession`, then clear the Keychain and local
  caches (image cache, upload queue of that user is kept but paused, see
  Uploads).
- `GET /api/healthz` is the only unauthenticated call (used for a
  connectivity check).

## Requests

- JSON bodies, `Content-Type: application/json`, `Accept: application/json`.
- Dates: ISO 8601 with fractional seconds (`2026-11-15T08:00:00.000Z`);
  decode with and without fractional seconds.
- Unknown JSON fields are ignored; unknown enum values decode to an
  `.unknown(String)` case rather than failing the whole response.
- Optional request fields that are absent are omitted from the JSON; a field
  explicitly set to null (e.g. `PATCH /items/{id} {locationId: null}`) is sent
  as `null`. The Swift request types model this with a tri-state
  (`Patch<T>`: `.unset`, `.null`, `.value(T)`).
- `User-Agent: Wardrobe-iOS/<CFBundleShortVersionString> (<build>; iOS <version>; <model>)`.
- Timeouts: 30 s per request, 120 s for photo PUTs.
- Errors: every non-2xx is thrown as `APIError(status, error, message)`.
  A non-JSON body becomes `error: "http_<status>"`. Transport failures are
  `APIError(status: 0, error: "network")`.
- Retryable (same request, same `Idempotency-Key`): status 0, 408, 425, 429,
  5xx, 409 `idempotency_in_progress` (honour `Retry-After`). Everything else is
  permanent.
- `Idempotency-Key`: a UUID v4 string chosen when the user action is created
  and persisted with it, for every `POST /items`, `POST /photos` and
  `POST /sessions`. A retry sends the byte-identical body (encode once, keep
  the `Data`).

## Photos

- **Capture → upload**: the app converts every capture to JPEG on the device
  (ImageIO, longest edge 2400 px, quality 0.85, orientation applied, EXIF/GPS
  stripped) before `POST /api/photos {itemId?, kind, contentType: "image/jpeg",
  size}`. It then `PUT`s the bytes to `uploadUrl` with exactly
  `uploadHeaders` and **no** `Authorization` header, then calls
  `POST /api/photos/{id}/complete`. HEIC is never uploaded (the server 422s it).
- **Expired upload URL**: an S3 403 on the PUT means the presigned URL
  expired; re-`POST /api/photos` with the same Idempotency-Key and body to get
  a fresh `uploadUrl` (contract: a replay of a pending photo returns a new URL).
- **Display**: `GET /api/photos/{id}/{variant}` answers 302 to a presigned S3
  URL. The API client must not follow that redirect with the bearer token
  attached (S3 rejects a request carrying two auth mechanisms, and the token
  must not leave our host): its `URLSessionTaskDelegate` stops the redirect,
  reads `Location`, and the image loader fetches that URL with a separate
  session that has no auth. A 404 means "not ready yet".
- **Cache**: photo bytes are immutable per `(photoId, variant)`, so the image
  loader caches them on disk (`Caches/photos/<photoId>/<variant>`, LRU,
  500 MB cap) and in memory. Presigned URLs are not cached past 4 minutes.
- **Placeholders**: show the photo's `blurhash` (decoded on device) until the
  thumb loads; `status != ready` shows a progress placeholder and the app polls
  `GET /api/items/{id}` every 2 s (max 60 s) while a photo of an open item is
  `pending`/`processing`.

## Uploads (offline queue)

Mirrors `lib/client/upload/queue.ts`. A capture becomes an `UploadJob`
persisted as JSON in `Application Support/uploads/<userSub>/<jobId>.json`
(the JPEG next to it) before any network call. Steps, each persisted on
success: `prepare` (JPEG) → `createItem` (only when the job creates an item;
`POST /items` with its key) → `createPhoto` (`POST /photos` with its key) →
`upload` (PUT) → `complete` → `updateItem` (when quick fields changed after
capture). Retryable failures back off (1 s doubling, jitter, cap 60 s);
permanent failures mark the job `failed` with the error for the user to retry
or discard. The queue runs on launch, on `scenePhase == .active`, and when
`NWPathMonitor` reports a satisfied path; it pauses when signed out and only
runs jobs of the signed-in `sub`. A finished job deletes its files.

## Deep links

| Input | Resolves to |
|-------|-------------|
| `https://wardrobe.vidur.xyz/l/<ownerId>/<code>` (universal link or scanned QR) | `GET /api/locations/by-code/<code>?owner=<ownerId>` → location screen. 404 → "Not found or not shared with you"; if `ownerId == me.id`, offer "Create location <code>". |
| `xyz.vidur.wardrobe://location/<id>` | location screen |
| `xyz.vidur.wardrobe://item/<id>` | item screen |
| Any other QR content | "Not a Wardrobe label" |

## Server additions (this repo)

| Route | Behaviour |
|-------|-----------|
| `GET /.well-known/apple-app-site-association` | Public (oauth2-proxy skip-auth route). `application/json`, `Cache-Control: public, max-age=3600`. Body: `{"applinks":{"details":[{"appIDs":[<IOS_APP_IDS…>],"components":[{"/":"/l/*"}]}]},"webcredentials":{"apps":[<IOS_APP_IDS…>]}}`. 404 when `IOS_APP_IDS` is unset or empty. |

New optional env var: `IOS_APP_IDS` (comma-separated `<team>.<bundle>`,
production value `2J2LYH5QBS.xyz.vidur.wardrobe`), parsed in `lib/env.ts`.

## Screens and their endpoints

| Screen | Endpoints |
|--------|-----------|
| Sign-in / no access | OIDC; `GET /me` |
| Catalogue (grid/list, filters, search, wardrobe switcher) | `GET /items` (cursor), `GET /categories`, `GET /tags?owner=`, `GET /locations?owner=`, `GET /shared-with-me` |
| Item detail / edit | `GET/PATCH/DELETE /items/{id}`, `POST /photos` + PUT + complete, `PATCH/DELETE /photos/{id}`, `GET/POST /items/{id}/analyses`, `POST …/apply` |
| New item | `POST /items` (Idempotency-Key) + photo upload |
| Locations (tree, filters, archived toggle) | `GET /locations?owner=&kind=&q=&archived=` |
| Location detail (contents, children, QR label, share) | `GET /locations/{id}`, `PATCH/DELETE /locations/{id}`, `POST /locations`, `POST /items/move` |
| Scan | on-device QR (VisionKit) → `GET /locations/by-code/{code}?owner=` |
| Pack (scan/pick location → rapid capture) | `POST /sessions`, upload queue (`POST /items` with `sessionId`, photos), `POST /items/move`, `GET /sessions/{id}`, `POST /sessions/{id}/end` |
| Unpack (pick location → move items out/elsewhere) | `POST /sessions {mode: unpack}`, `GET /locations/{id}`, `POST /items/move`, `POST /sessions/{id}/end` |
| Sharing | `GET/POST/PATCH/DELETE /shares`, `GET /shared-with-me` |
| Settings | `GET /me`, sign-out, upload queue status, cache clear, version |

Web-only (not in the app): `/admin/labels` (printable sheets) and
`/admin/categories`. The location screen can still show and share a single
QR label image.
