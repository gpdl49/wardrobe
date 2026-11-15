# Wardrobe for iPhone and iPad

A native SwiftUI client for the same server the web app uses. Nothing about
the data, the rules or the HTTP API changes; the app signs in with Zitadel
itself and talks to `https://wardrobe.vidur.xyz/api` through oauth2-proxy
with a bearer token.

| Doc | What |
|-----|------|
| [api-contract.md](api-contract.md) | Names, auth, request rules, photos, uploads, deep links, server additions, screen → endpoint map |
| [development-plan.md](development-plan.md) | Work packages, file ownership, per-package contracts and acceptance tests, review and release sequence |
| [setup.md](setup.md) | One-time manual steps: Apple Developer, App Store Connect, API key, GitHub secrets, TestFlight |

## How it works

```
iPhone / iPad                         Centerpoint (wardrobe-system pod)
┌──────────────────────────┐          ┌───────────────────────────────────┐
│ SwiftUI app              │  HTTPS   │ oauth2-proxy :4180                │
│  ├ AuthSession (OIDC)────┼─────────►│  cookie (web) or Bearer ID token  │
│  ├ LiveWardrobeAPI ──────┼─────────►│  (native: SKIP_JWT_BEARER_TOKENS) │
│  ├ UploadQueue ──┐       │          │        │ X-Forwarded-User/Groups  │
│  └ ImagePipeline │       │          │        ▼                          │
└──────────────────┼───────┘          │ Next.js app 127.0.0.1:3000        │
                   │ presigned PUT/GET└───────────────────────────────────┘
                   ▼
             S3 centerpoint-wardrobe-photos
```

- **Sign-in**: authorization code + PKCE against Zitadel's native app
  `wardrobe-ios` in `ASWebAuthenticationSession`. Tokens in the Keychain;
  the ID token (it carries `email`, `preferred_username`, `groups`) is the
  bearer token, refreshed with the refresh token. oauth2-proxy verifies it and
  sets the same headers as for a browser session, so the server sees the
  same user either way.
- **Photos**: captured with the camera (or picked from the library),
  converted to JPEG on the device, queued on disk and uploaded with presigned
  PUTs that survive app restarts and dead zones in the loft. Display images
  come through `GET /api/photos/{id}/{variant}` redirects, cached on disk.
- **Cropping**: item creation and packing use the full-screen
  [Mantis](https://github.com/guoyingtao/Mantis) editor (MIT, pinned in
  `ios/project.yml`) for draggable crop edges, pan/zoom, rotation and aspect
  ratios. “Use original” keeps the input bytes; a confirmed crop becomes JPEG.
- **QR labels**: the in-app scanner (VisionKit) and universal links both
  resolve `https://wardrobe.vidur.xyz/l/<ownerId>/<code>`; the server serves
  `/.well-known/apple-app-site-association` for that.
- **Phone and tablet**: one universal binary. `TabView` with
  `.sidebarAdaptable` is a tab bar on iPhone and a sidebar on iPad; screens
  use size classes for multi-column grids and side-by-side detail layouts on
  iPad (all orientations, Split View and Stage Manager).
- **Releases**: GitHub Actions on a macOS runner archives with cloud signing
  (App Store Connect API key) and uploads to TestFlight on every `main` push
  that touches `ios/`; internal testing distributes it to your devices.

## Code layout

```
ios/
  project.yml                 XcodeGen spec (Wardrobe.xcodeproj is generated, gitignored)
  ExportOptions.plist         App Store Connect export (CI)
  App/Sources/                SwiftUI app: AppModel, Router, RootView, Features/*, UI/*
  App/Resources/              Asset catalog
  AppTests/                   App unit tests (Swift Testing, simulator)
  Packages/WardrobeKit/       Platform-independent core (swift test on the Mac)
    Sources/WardrobeKit/      Models, API, Auth, Upload, Images, Util
    Sources/WardrobeKitTesting/  FixtureWardrobeAPI for previews and tests
```

Local commands: `mise run ios:generate`, `mise run ios:test-kit`,
`mise run ios:test`. In DEBUG builds the app also accepts the launch
arguments `-fixtures` (in-memory data, signed in) and
`-devServer http://localhost:3000` (a local `AUTH_MODE=dev` server, no
sign-in).

The `Wardrobe` scheme runs fixture UI tests; local-server tests are skipped
unless the `WardrobeLocalReview` or `WardrobeOfflineReview` scheme is used.
Those tests require a seeded dev server and the disposable review data named
in `ios/UITests/LocalServerTests.swift`. The external-link and offline tests
print prompts for the corresponding `simctl openurl` and server stop/restart
steps; run them individually when performing those manual checks.
