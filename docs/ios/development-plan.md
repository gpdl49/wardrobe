# Wardrobe iOS: development plan

Built by parallel agents against a shared foundation (WP0), each in its own
git worktree and branch off `feat/ios-app`, then reviewed twice and merged
as one PR. Read [api-contract.md](api-contract.md) first; this file adds who
builds what, in which files, and how each package proves it works.

## Sequence

| Phase | Who | What |
|-------|-----|------|
| 0. Contract + foundation | lead (Claude) | These docs; WP0 scaffold on `feat/ios-app`; homestacks PR (Zitadel `wardrobe-ios`, oauth2-proxy bearer tokens, AASA skip-auth route, contract doc) |
| 1. Buildout | 9 agents in parallel (Gemini 3.8 Flash, Antigravity) | WP1–WP9, one branch each: `ios/wp<N>-<slug>`. Gemini finished WP9; the other eight hit the Antigravity quota mid-way, were checkpointed as WIP commits, and were finished by Composer 2.5 (Cursor) from those checkpoints |
| 2. Integration | lead | Merge WP branches into `feat/ios-app`, resolve conflicts, full test run on iPhone and iPad simulators |
| 3. Black-box review | GPT-6.1 Terra (Codex) | The single review (the planned Composer code review was dropped once Composer did the buildout). Exercise the built app (simulator, `-fixtures` and `-devServer` against a local server) and CI config against the contract without relying on the implementation's own claims; fix what it finds in its own thread; commit, open the PR, merge |
| 4. Release | CI | `main` push → TestFlight; manual steps in [setup.md](setup.md) |

## Ground rules for every work package

1. **Contract first.** `docs/ios/api-contract.md` and the public API of the
   WP0 files are fixed. If a package needs a change to a frozen file, it does
   not edit it: it works around it and lists a "contract change request" in
   its final report.
2. **Own your files.** Edit only the files and directories your package owns
   (table below). New files go in your own directories. Exception: a package
   may replace the body of a WP0 shell file it owns (keeping the public API).
3. **Tests with the code.** Swift Testing (`import Testing`). Kit packages:
   `cd ios/Packages/WardrobeKit && swift test` (runs on the Mac). App
   packages: view-model logic in `@Observable` classes that take
   `any WardrobeAPI`, tested in `ios/AppTests/<Feature>Tests.swift` with
   `FixtureWardrobeAPI` or your own test double. Views get `#Preview`s using
   `AppModel.preview()`.
4. **Simulator isolation.** Several agents build at once. Create your own
   simulators and use their UDIDs; never boot or erase shared ones:
   ```sh
   IPHONE=$(xcrun simctl create "wp<N>-iphone" "iPhone 17")
   IPAD=$(xcrun simctl create "wp<N>-ipad" "iPad Pro 13-inch (M5)")
   cd ios && xcodegen generate --quiet
   xcodebuild test -project Wardrobe.xcodeproj -scheme Wardrobe \
     -destination "id=$IPHONE" -derivedDataPath build/DerivedData \
     CODE_SIGNING_ALLOWED=NO -quiet
   xcodebuild build -project Wardrobe.xcodeproj -scheme Wardrobe \
     -destination "id=$IPAD" -derivedDataPath build/DerivedData \
     CODE_SIGNING_ALLOWED=NO -quiet
   xcrun simctl delete "$IPHONE" "$IPAD"   # when done
   ```
5. **Done means**: builds with zero warnings in your files under Swift 6
   strict concurrency; `swift test` and the app tests pass; iPhone and iPad
   builds succeed; committed on your branch with a conventional commit
   message (`feat(ios): …`) and pushed (`git push -u origin HEAD`). Do not
   open a PR or merge.
6. **Platform style.** iOS 26 system look (Liquid Glass comes from standard
   components: `NavigationStack`, `List`, `Form`, toolbars, `.glassEffect`
   only where a custom control needs it). SF Symbols, Dynamic Type, dark mode,
   VoiceOver labels on icon-only buttons. iPad: use
   `@Environment(\.horizontalSizeClass)`: adaptive grids
   (`GridItem(.adaptive(minimum:))`), two-column detail layouts in regular
   width, keyboard shortcuts for primary actions. No third-party packages.
7. **Errors.** Every API call in a view model catches errors and routes them
   through `AppModel.message(for:)` (which ends the session on `signed_out`)
   into an `errorAlert` or inline message. `access.canEdit` decides whether
   edit controls appear; a 403 still shows a message.
8. **Formatting**: tabs, 120-column soft limit, `// MARK:` sections, doc
   comments on types. Match the style of the WP0 files.

## WP0 foundation (done, lead)

Frozen public API (read these before starting):

| File | Provides |
|------|----------|
| `ios/project.yml` | Targets `Wardrobe` (app), `WardrobeTests`; package `WardrobeKit` (products `WardrobeKit`, `WardrobeKitTesting`); Info.plist keys; entitlements |
| `Packages/WardrobeKit/Package.swift` | Package, iOS 26 + macOS 26 |
| `WardrobeKit/Models/Enums.swift`, `Models/DTOs.swift` | All response types (open enums, `…DTO` structs with public inits) |
| `WardrobeKit/API/Requests.swift`, `Patch.swift` | Request bodies/queries, tri-state `Patch<T>`, `normalizeLocationCode` |
| `WardrobeKit/API/WardrobeAPI.swift` | `protocol WardrobeAPI` (every endpoint), `protocol TokenProvider` |
| `WardrobeKit/API/APIError.swift`, `Coding.swift` | `APIError` (+ `isRetryable`, `.signedOut`), `JSONDecoder.wardrobe`, `JSONEncoder.wardrobe` |
| `WardrobeKit/Util/Config.swift` | `AppConfig` (Info.plist) |
| `WardrobeKitTesting/FixtureWardrobeAPI.swift` | In-memory API with seed data and a `calls` log |
| `App/Sources/AppModel.swift` | `AppModel` (config, auth, api, uploads, images, router, me, scopes/`WardrobeScope`, `bootstrap`, `message(for:)`, `preview()`, launch modes) |
| `App/Sources/Router.swift` | `Route`, `AppTab`, `DeepLink` parsing, `Router.open` |
| `App/Sources/RootView.swift` | Sign-in gate, `MainTabs`, `routeDestinations()` |
| `App/Sources/UI/Shared.swift`, `UI/Placeholder.swift` | Labels/symbols for enums, `Color(hex:)`, `errorAlert` |

Shell files (public API frozen, body replaced by the owning WP): see the
table below.

## File ownership

| WP | Owns (create/replace freely) | Shell files it implements |
|----|-----------------------------|---------------------------|
| WP1 API client | `WardrobeKit/API/LiveWardrobeAPI.swift`, `WardrobeKit/API/Live/**`, `Tests/WardrobeKitTests/API/**` | `LiveWardrobeAPI.swift` |
| WP2 Auth | `WardrobeKit/Auth/**`, `Tests/WardrobeKitTests/Auth/**` | `AuthSession.swift`, `WebAuthenticationPresenter.swift` |
| WP3 Uploads | `WardrobeKit/Upload/**`, `Tests/WardrobeKitTests/Upload/**` | `UploadQueue.swift` |
| WP4 Catalogue + images | `WardrobeKit/Images/**`, `Tests/WardrobeKitTests/Images/**`, `App/Sources/Features/Catalogue/**`, `App/Sources/UI/RemotePhotoView.swift`, `App/Sources/UI/WardrobeSwitcher.swift`, `App/Sources/UI/Catalogue*`, `AppTests/Catalogue*` | `ImagePipeline.swift`, `RemotePhotoView.swift`, `WardrobeSwitcher.swift`, `CatalogueView.swift` |
| WP5 Items | `App/Sources/Features/Items/**`, `AppTests/Item*` | `ItemDetailView.swift`, `NewItemView.swift` |
| WP6 Locations + scan | `App/Sources/Features/Locations/**`, `App/Sources/Features/Scan/**`, `AppTests/Location*`, `AppTests/Scan*` | `LocationsView.swift`, `LocationDetailView.swift`, `LocationCodeResolverView.swift`, `ScannerView.swift` |
| WP7 Pack/unpack | `App/Sources/Features/Pack/**`, `AppTests/Pack*` | `PackView.swift`, `UnpackView.swift`, `SessionSummaryView.swift` |
| WP8 Sharing, settings, sign-in | `App/Sources/Features/Sharing/**`, `Settings/**`, `SignIn/**`, `AppTests/Sharing*`, `AppTests/Settings*` | `SharingView.swift`, `SettingsView.swift`, `SignInView.swift`, `NoAccessView.swift` |
| WP9 Server + CI | `app/.well-known/**`, `lib/env.ts` (add `IOS_APP_IDS` only), `lib/apple/**`, `test/**/aasa*`, `.github/workflows/ios.yaml`, `ios/ExportOptions.plist`, `ios/scripts/**`, `README.md` (iOS section only) | none |

`FixtureWardrobeAPI` is shared: a package may fill in only the methods that
currently throw `unimplemented` and that it needs (WP5: `runAnalyses`,
`applyAnalysis`, `updatePhoto`; WP7: `session`, `endSession`; WP8:
`createShare`, `updateShare`), without changing seed data or other methods.
Prefer a private test double in your own test file.

Cross-package use before merge: packages call each other only through the
frozen shells (e.g. WP7 calls `UploadQueue.enqueue` and presents
`ScannerView`); the shells compile and do nothing, so each branch builds on
its own.

## WP1 — API client (`LiveWardrobeAPI`)

Implements every `WardrobeAPI` method over URLSession per the contract.

- `init(baseURL:tokens:configuration:)`; one `URLSession` for API calls
  (delegate stops redirects), one for presigned S3 calls (no auth header,
  follows nothing special).
- Paths: `/api/...` exactly as in the HTTP API; `by-code/{code}` and other
  path segments percent-encoded; queries from `queryItems`.
- Headers: `Authorization: Bearer <validToken()>`, `Accept`, `Content-Type`
  for bodies, `User-Agent` (contract format), `Idempotency-Key` where the
  method takes one. Bodies encoded once with `JSONEncoder.wardrobe`.
- Auth failure detection and single retry after `refreshAfterRejection`
  exactly per contract (401; 403 with non-JSON body; any 3xx except on the photo-variant GET).
- Errors: JSON `{error, message}` → `APIError`; non-JSON → `http_<status>`;
  URLError → status 0 `network`; decoding failure → `decoding`;
  `Retry-After` parsed (seconds or HTTP date).
- `photoURL`: 302 → `Location` URL (absolute or relative to base); 404 → nil.
- `uploadPhoto`: PUT with exactly the given headers, 120 s timeout; S3 403
  → `APIError(403, "upload_expired")`; other non-2xx → `http_<status>`.
- `health`: GET `/api/healthz` without auth, true on 200.
- **Tests** (URLProtocol stub): path/query/headers per endpoint family;
  bearer injection; Idempotency-Key presence; 401→refresh→retry succeeds;
  second 401 → `signedOut`; 403 JSON is not retried; 302 (to Zitadel or `/oauth2/...`)
  on a JSON endpoint treated as auth failure; photo redirect not followed and no Authorization
  sent to S3; PATCH null encoding; error decoding; Retry-After.

## WP2 — Auth (`AuthSession`, OIDC, Keychain)

- Discovery, PKCE (S256, 43–128 char verifier, `state` and `nonce`
  checked), authorization URL with `client_id`, `redirect_uri`,
  `response_type=code`, `scope`, `code_challenge`, `state`, `nonce`,
  `prompt` omitted. Code exchange and refresh as form posts (public client,
  no secret).
- ID token: decode claims (no signature verification needed on device; the
  server verifies), validate `iss`, `aud` contains client ID, `nonce` on
  sign-in, `exp`. `AuthClaims` from `sub`, `email`, `preferred_username`,
  `groups`, `exp`.
- `TokenStore` actor implementing `TokenProvider`: Keychain persistence
  (contract attributes), proactive refresh (<5 min), single-flight refresh,
  rotation, `refreshAfterRejection` (refresh unless another refresh already
  produced a newer token), `invalid_grant` → clear + notify `AuthSession`
  (state → `.signedOut` on the main actor).
- `AuthSession`: `restore()` (Keychain → `.signedIn` or `.signedOut`;
  expired ID token with a refresh token refreshes first, network failure
  keeps the session and stays `.signedIn` with stale claims), `signIn()`
  (cancel is quiet; errors set `lastError`), `signOut()` (end-session via
  presenter with `id_token_hint`, then clear; clears even if the browser
  step fails), `sessionEnded()`. Keep the `signedInAs` initializer and
  `isStatic` semantics.
- `WebAuthenticationPresenter`: `ASWebAuthenticationSession` with
  `.customScheme(callbackScheme)`, a presentation context provider using the
  key window, `prefersEphemeralWebBrowserSession = false`.
- Keychain access behind a small protocol so tests use an in-memory store.
- **Tests**: PKCE challenge vector (RFC 7636 appendix B), authorization URL,
  callback parsing (state mismatch, error param), token response decoding,
  claims validation, refresh single-flight (concurrent callers → one
  request), rotation persisted, `invalid_grant` → signed out, restore paths.

## WP3 — Upload queue (`UploadQueue`)

Mirror `lib/client/upload/queue.ts` (read it and its tests) with the
contract's persistence layout.

- `enqueue` writes the original bytes and job JSON before returning;
  `prepare` converts to JPEG with ImageIO (`CGImageSourceCreateThumbnailAtIndex`
  with `kCGImageSourceCreateThumbnailWithTransform`, max pixel 2400,
  quality 0.85, no metadata), replaces the original with the JPEG.
- Steps and their persistence exactly as the contract; Idempotency-Keys per
  job and step (`<jobId>-item`, `<jobId>-photo`) and stored bodies reused
  byte-for-byte on retry.
- `upload_expired` → re-POST photo with the same key and body, then PUT.
- Retry/backoff per contract (inject clock/sleeper for tests); permanent
  failure → `.failed` with message; `signed_out` → pause (not failed).
- Concurrency: at most 2 jobs running; jobs for one item serialised so the
  item is created once.
- `start(userSub:)` loads that user's jobs; `pause()`; `resume()`;
  `NWPathMonitor` triggers `resume()` (behind a protocol for tests).
- `updateNewItemFields` before the item exists merges into the create body
  only if `createItem` hasn't been sent; afterwards it queues `updateItem`
  (PATCH with the changed fields).
- **Tests** (with `FixtureWardrobeAPI` or a scripted double, temp dirs):
  happy path new item and existing item; crash/resume at each step (new
  queue instance on the same directory continues); retry with same keys and
  identical bodies; upload_expired path; permanent failure; per-user
  isolation; JPEG output (size ≤ 2400, JPEG magic, EXIF stripped — generate
  a test image with CoreGraphics + GPS metadata).

## WP4 — Catalogue and images

- `ImagePipeline` actor: memory cache (NSCache-like, count/cost limits),
  disk cache LRU per contract, de-duplicated in-flight loads, presigned URL
  reuse ≤ 4 min, `clear()`. Blurhash decoder (`WardrobeKit/Images/Blurhash.swift`,
  pure Swift → RGBA pixels; tests against known hashes from the `blurhash`
  npm package's test vectors).
- `RemotePhotoView`: blurhash → image fade-in; status not ready → progress
  placeholder; failure → symbol. Uses `AppModel.images`.
- `WardrobeSwitcher`: `Menu` in the toolbar listing `AppModel.scopes`;
  selecting sets `model.scope`; hidden with a single scope.
- `CatalogueView` + `CatalogueModel`: grid (adaptive columns; iPhone 2–3,
  iPad 4–6) and list toggle (persist with `@AppStorage`), search
  (`.searchable`, debounced 300 ms), filters sheet (location, category tree
  incl. descendants, tag, season, colour from the palette in use, status),
  active-filter chips, cursor pagination (load more at end), pull to refresh,
  empty states, `scope` changes reload with `owner=`. Tap → `Route.item`.
  "+" (when scope access can edit) presents `NewItemView(ownerId:)`.
- **Tests**: query building from filters + scope, pagination append and stop,
  debounce, reset on scope change; pipeline caching/dedupe/eviction;
  blurhash vectors.

## WP5 — Items

- `ItemDetailView`: photo carousel (`TabView` paging; display variant),
  fields (name, category path, brand, size, colours swatches, pattern,
  material, seasons, status, location, tags, notes), movement history,
  suggestions panel (latest done analysis per kind: show suggested values,
  apply selected fields → `applyAnalysis`, re-run → `runAnalyses`; 409 when
  vision disabled shows a message), polling while photos are processing
  (contract), delete with confirmation. iPad regular width: photos left,
  details right.
- Edit (`ItemEditView` sheet/form): all editable fields with
  `UpdateItemRequest` diffing (only changed fields; null for cleared),
  category picker (tree), location picker (current scope's locations),
  tag editor (existing tags suggestions), colour editing (remove/reorder is
  enough), seasons multi-select, status picker.
- Photos: add from camera (`UIImagePickerController` wrapper or
  `.fullScreenCover` with a simple camera) or library (`PhotosPicker`),
  choose kind, enqueue via `UploadQueue.enqueue(target: .item(id))`; set
  cover, change kind, delete photo.
- `NewItemView`: quick form (name, category, location default from caller)
  + at least one photo or "create without photo"; uses
  `UploadQueue.enqueue(target: .newItem(...))` when a photo is taken, else
  `createItem` with an Idempotency-Key; `onCreated` with id when known.
- **Tests**: edit diffing (`UpdateItemRequest` JSON), apply-fields
  selection, polling start/stop, permission gating (`view` hides edit).

## WP6 — Locations and scanning

- `LocationsView` + model: hierarchical list (children indented /
  `OutlineGroup`), filter by kind (segmented/menu), search, archived toggle,
  item counts, create (`LocationFormView`: kind, code validated with
  `normalizeLocationCode`, name, notes, parent), scope-aware (`owner=`), scan
  button in the toolbar → `ScannerView` → `Router.open(route)`.
- `LocationDetailView`: header (kind, code, name, notes, parent link),
  children, items (grid, `RemotePhotoView`), actions per access: edit,
  archive/restore, delete (409 → message "Still holds items"), add child,
  add item (`NewItemView(locationId:)`), select items → move to another
  location (`moveItems`), QR label (CoreImage `CIQRCodeGenerator` of
  `DeepLink.labelURL`, with code and name; share sheet / save to Photos /
  print via `UIPrintInteractionController`).
- `LocationCodeResolverView`: resolves via `location(code:owner:)`, then
  replaces itself with `LocationDetailView`; 404 → "Not found or not shared
  with you", plus "Create location <code>" when `ownerId == me.id`.
- `ScannerView`: `DataScannerViewController` (barcode `.qr`), shows guidance;
  when unavailable (simulator / no camera / no permission) a manual code
  entry field (code in your own wardrobe) and a paste button. Calls
  `onScan` once.
- **Tests**: tree building from flat list, filters → query, code validation,
  resolver outcomes (found / 404 own / 404 other), QR payload equals label
  URL.

## WP7 — Pack and unpack

Mirror the web flows (`components/pack/*`, `components/unpack/*`, read their
tests) natively.

- `PackView`: choose a location (scan via `ScannerView`, or pick from
  scope's bag/suitcase-first list) → `createSession(mode: .pack)` with an
  Idempotency-Key → capture loop: full-screen camera (AVFoundation
  `AVCaptureSession` + `AVCapturePhotoOutput`, shutter button, last-capture
  thumbnail, count) where each shot enqueues
  `.newItem(CreateItemRequest(locationId:, sessionId:))` with kind `main`;
  optional quick fields per capture (name, category chips) via
  `updateNewItemFields`; "add existing item" search → `moveItems` into the
  location with `sessionId`; upload progress from `UploadQueue.jobs`; finish
  → `endSession` → `SessionSummaryView`. Keeps the screen awake while
  capturing. Camera unavailable (simulator) → `PhotosPicker` fallback.
- `UnpackView`: choose a location → `createSession(mode: .unpack)` → list
  its items with multi-select → move to a chosen destination location (or
  "no location") with `sessionId`; finish → `endSession` → summary.
- `SessionSummaryView`: `session(id:)` → location, mode, duration, items
  (tap → item).
- Active session survives app relaunch (store session id + location in
  `@AppStorage`/file; on return offer resume or finish).
- **Tests**: session lifecycle (create once per key, end idempotent),
  capture enqueues the right target/session, move payloads, resume state.

## WP8 — Sharing, settings, sign-in

- `SharingView`: two sections. "Shared by me": list (`grantee`, access,
  whole wardrobe or location), add (grantee email/username, access, scope:
  whole wardrobe or pick a location), change access, revoke (swipe, with
  confirmation); 422 messages shown inline (unknown grantee / self), 409
  duplicate. "Shared with me": list; tap → set `AppModel.scope` and switch to
  the catalogue tab. Refreshes `AppModel.refreshShares()` after changes.
- `SettingsView`: account (display name, email, admin badge), uploads
  (pending/failed counts, list of failed jobs with retry/discard), clear
  image cache, open web app in Safari, version/build, sign out
  (confirmation; `AppModel.signOut()`).
- `SignInView`: app name/icon, "Sign in with Centerpoint" (calls
  `auth.signIn()`), progress while signing in, `lastError`. Configuration
  error (empty client ID) shows a clear message instead of the button.
- `NoAccessView`: explanation (needs the `wardrobe` role), signed-in
  account, sign out.
- **Tests**: share form validation and request bodies, error mapping,
  "shared with me" → scope, settings counts.

## WP9 — Server additions and CI

- Server: `GET /.well-known/apple-app-site-association` route
  (`app/.well-known/apple-app-site-association/route.ts`, no auth, contract
  body, 404 when `IOS_APP_IDS` unset), env parsing in `lib/env.ts`
  (optional, comma-separated, each `^[A-Z0-9]{10}\.[A-Za-z0-9.-]+$`), unit
  test of the body builder, route test. Add `IOS_APP_IDS` to `.env.example`
  (commented). Run `aube run --no-install lint`, `typecheck`, `test`, `build`.
- `.github/workflows/ios.yaml` (jactionlint-clean, actions pinned by SHA like
  `ci.yaml`, `permissions: contents: read`):
  - Triggers: `pull_request` and `push` to `main` with `paths: [ios/**,
    docs/ios/**, .github/workflows/ios.yaml]`, plus `workflow_dispatch`.
  - `test` job on `macos-26`: select the newest `/Applications/Xcode_27*.app`,
    install `xcodegen` (mise, pinned version), `swift test` for WardrobeKit,
    generate, `xcodebuild test` on an iPhone simulator and `build` for an
    iPad simulator, unsigned.
  - `testflight` job: needs `test`; only on `push` to `main` or
    `workflow_dispatch` on `main`; `concurrency: ios-testflight`
    (no cancel). Fails fast with clear messages when `ASC_KEY_ID`,
    `ASC_ISSUER_ID`, `ASC_KEY_P8` or `vars.IOS_OIDC_CLIENT_ID` is missing.
    Writes the key to `$RUNNER_TEMP/AuthKey.p8` (umask 077), `xcodebuild
    archive` (Release, `generic/platform=iOS`,
    `CURRENT_PROJECT_VERSION=${{ github.run_number }}`,
    `WARDROBE_OIDC_CLIENT_ID=${{ vars.IOS_OIDC_CLIENT_ID }}`,
    `-allowProvisioningUpdates` + `-authenticationKeyPath/-ID/-IssuerID`),
    then `xcodebuild -exportArchive` with `ios/ExportOptions.plist`
    (`method: app-store-connect`, `destination: upload`, `teamID:
    2J2LYH5QBS`, `signingStyle: automatic`, `uploadSymbols: true`,
    `manageAppVersionAndBuildNumber: false`), and always deletes the key.
    Uploads the `.xcarchive` logs on failure as an artifact.
  - `ios/scripts/` only if a step is too long for YAML (keep them POSIX sh,
    `set -eu`).
- README: short "iOS app" section linking `docs/ios/`.
- **Tests**: AASA unit + route tests; `jactionlint` passes on the workflow;
  `xcodebuild -exportArchive` options validated with `plutil -lint`.

## Integration checklist (lead, phase 2)

1. Merge `ios/wp1…wp9` into `feat/ios-app` in order WP1, WP2, WP3, WP4,
   WP9, WP5, WP6, WP7, WP8; resolve `FixtureWardrobeAPI` overlaps.
2. `mise run ios:test-kit`, `mise run ios:test`, server `lint`,
   `typecheck`, `test`, `build`.
3. Smoke run with `-fixtures` on iPhone and iPad simulators: every tab
   renders, navigation between routes works.
4. Collect contract change requests from WP reports; apply or reject them.

## Review gate

- **GPT-6.1 Terra (black-box)**: treats the app as a product: builds and runs
  it on iPhone and iPad simulators with `-fixtures` and against a local
  `AUTH_MODE=dev` server (`-devServer`), exercises every screen in the
  contract's screen table, deep links (`xcrun simctl openurl`), offline
  upload resume (kill and relaunch mid-upload), and dry-runs CI logic.
  Fixes what it finds in its own thread, then commits, opens the PR and
  merges.
