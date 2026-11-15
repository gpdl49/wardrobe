# Outfits, Immich and AI suggestions: development plan

Built by parallel agents (GPT-6.1 Terra through Codex) against a shared
foundation, each in its own worktree and branch off `feat/outfits`, then
integrated, reviewed and merged as one PR. Read [contract.md](contract.md)
first; this file says who builds what, in which files, and how each package
proves it works.

## Sequence

| Phase | Who | What |
|-------|-----|------|
| 0. Contract + foundation | lead | `contract.md`; on `feat/outfits`: Prisma schema and migration, `lib/api/types.ts`, env switches, `lib/access` outfit rules, `GET /api/me` features, nav items, `ImmichPicker` stub |
| 1. Buildout | 8 agents in parallel | WP1–WP7 in this repo, WP11 in homestacks |
| 2. iOS features | 3 agents in parallel | WP8–WP10, once WP7 (WardrobeKit) is merged into `feat/outfits` |
| 3. Integration | lead | Merge the branches into `feat/outfits`, resolve conflicts, run lint, typecheck, test, build and the iOS tests |
| 4. Black-box review | one agent | Exercise the built web app and iOS app against the contract; fix what it finds |
| 5. PR | lead | One PR to `main`, left for the owner to merge (a merge deploys the server and ships a TestFlight build) |

## Ground rules for every work package

1. **Contract first.** `docs/outfits/contract.md`, `lib/api/types.ts`,
   `prisma/schema.prisma`, the migration, `lib/access`, `lib/env.ts`,
   `lib/client/api.ts`, `lib/client/queries.ts` and `components/nav-items.ts`
   are frozen. If you need a change, work around it and list a "contract
   change request" in your final report.
2. **Own your files.** Edit only the files and directories your package owns
   (below). New files go in your own directories.
3. **Follow `AGENTS.md`.** Routes use `withAuth` + `parseBody`/`parseQuery`,
   zod schemas in `lib/<feature>/schema.ts`, rules in
   `lib/<feature>/service.ts`, `ApiError`s for every error, access through
   `lib/access`. `app/api/locations` and `lib/shares` are the references.
4. **Tests with the code.** Unit tests next to the code; API tests in `test/`
   against a real Postgres. A Postgres 18 is already listening on
   `localhost:5432` (user and password `wardrobe`). The suite wipes its
   database, so use **your own**: create `wardrobe_test_wp<N>` once
   (`CREATE DATABASE`) and export
   `TEST_DATABASE_URL=postgresql://wardrobe:wardrobe@localhost:5432/wardrobe_test_wp<N>`.
   S3 is faked in tests (`test/helpers/s3.ts`); fake Immich and OpenRouter the
   same way (inject `fetch`), never call the real services from tests.
5. **Done means**: `aube run --no-install lint`, `typecheck`, `test` and
   `build` pass (iOS packages: the checks in `docs/ios/development-plan.md`
   rule 4 and 5 instead); committed on your branch with a conventional commit
   message and pushed (`git push -u origin HEAD`). Do not open a PR or merge.
   Run `mise install && mise run setup` first in a fresh worktree.
6. **Report**: what you built, the checks you ran and their results, anything
   left undone, and contract change requests.

## Work packages

| WP | Branch | Owns | Builds |
|----|--------|------|--------|
| 1 Outfits API | `outfits/wp1-api` | `lib/outfits/**`, `app/api/outfits/**` except `[id]/immich-assets`, `lib/photos/**`, `app/api/photos/**`, `test/api/outfits*.test.ts`, `test/api/photos.test.ts`, `test/helpers/outfits.ts` | Outfit CRUD, list, shared-with-me, outfit shares, `suggestionId` on create, outfit photos in the photo pipeline (`outfitId`, kind `outfit`, access, deletion, no analyses), cover-photo access through an outfit, `OutfitDetail` including Immich links read from the database |
| 2 Immich API | `outfits/wp2-immich` | `lib/immich/**`, `app/api/immich/**`, `app/api/outfits/[id]/immich-assets/**`, `test/api/immich*.test.ts` | AES-256-GCM key storage, Immich client (verified against the Immich v3 API), status/connect/disconnect, asset search and thumbnail proxy, link/unlink, variant streaming with the linker's key |
| 3 AI API | `outfits/wp3-ai` | `lib/suggestions/**`, `lib/analyses/**`, `lib/jobs/**`, `app/api/suggestion-runs/**`, `app/api/outfit-suggestions/**`, `app/api/items/analyses/**`, `test/suggestions*.test.ts`, `test/analyses.test.ts` | Suggestion runs (prompt, strict JSON schema, validation, job), dismiss, bulk vision queueing and bulk tag apply, tag vocabulary in the vision prompt |
| 4 Web outfits | `outfits/wp4-web` | `app/outfits/**` except `suggest`, `components/outfits/**`, `components/items/**`, `lib/client/outfits.ts`, `lib/client/upload/**` | `/outfits`, `/outfits/new`, `/outfits/[id]`, `/outfits/[id]/edit`, item picker, photo gallery with upload and the Immich picker, share dialog, "in outfits" on the item page |
| 5 Web Immich + settings | `outfits/wp5-web-immich` | `app/settings/**`, `components/immich/**`, `components/settings/**`, `lib/client/immich.ts` | `/settings` (Immich connection, bulk tagging card), the real `ImmichPicker` |
| 6 Web suggestions | `outfits/wp6-web-ai` | `app/outfits/suggest/**`, `components/suggestions/**`, `lib/client/suggestions.ts` | `/outfits/suggest`: request form, polling, proposals with save and dismiss, past runs; exports `TaggingCard` for `/settings` from `components/suggestions/tagging-card.tsx` |
| 7 iOS kit | `outfits/wp7-ios-kit` | `ios/Packages/WardrobeKit/**`, `ios/App/Sources/Router.swift`, `RootView.swift`, `AppModel.swift`, `ios/App/Sources/Features/Outfits/OutfitsView.swift` (shell), `docs/ios/api-contract.md` | DTOs, requests, `WardrobeAPI` methods, live client, fixtures, an Outfits tab and routes with placeholder screens |
| 8 iOS outfits | `outfits/wp8-ios-outfits` | `ios/App/Sources/Features/Outfits/**` except `Photos/` and `Suggest/`, `ios/AppTests/Outfit*Tests.swift` | List, detail, builder, sharing |
| 9 iOS photos + Immich | `outfits/wp9-ios-photos` | `Features/Outfits/Photos/**`, `Features/Settings/**`, `ios/AppTests/Immich*Tests.swift`, `ios/AppTests/SettingsTests.swift` | Outfit photo upload, Immich picker, Immich connection in Settings |
| 10 iOS suggestions | `outfits/wp10-ios-suggest` | `Features/Outfits/Suggest/**`, `ios/AppTests/Suggest*Tests.swift` | Suggestion request, proposals, save and dismiss, bulk tagging |
| 11 homestacks | (homestacks repo) | `docs/wardrobe.md`, `clusters/centerpoint/wardrobe-system/**` | Port the contract into `docs/wardrobe.md`; `IMMICH_URL`, `SECRETS_KEY` secret, egress to Immich; PR left for review |

Seams between packages:

- WP1 reads `OutfitImmichAsset` rows to build `OutfitDetail.photos`; WP2
  writes them. The URL shape is in the contract.
- WP1's `POST /outfits` marks a suggestion saved; WP3 owns everything else
  about suggestions.
- WP4 imports `ImmichPicker` (stub now, WP5's at merge) and links the chosen
  assets itself. WP5's `/settings` imports WP6's `TaggingCard`; until merge it
  renders nothing if the module is missing, so WP5 adds a one-line placeholder
  export at that path only if the file does not exist yet.
- Web packages build against `lib/api/types.ts` with a mocked `fetch` in
  component tests; the servers land at integration.
