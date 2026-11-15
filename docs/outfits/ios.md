# iOS feature handoff

Build on WP7 and the frozen [contract](contract.md). Use `AppModel` from the
SwiftUI environment for `api`, `images`, `scope`, `router`, and error handling
through `message(for:)`. Run the isolated simulator and Swift checks in
[the iOS development plan](../ios/development-plan.md).

## WP8 — outfits

Own `ios/App/Sources/Features/Outfits/**` except `Photos/` and `Suggest/`, and
`ios/AppTests/Outfit*Tests.swift`. Replace the shells in `OutfitsView.swift`:
keep `OutfitsView()` and `OutfitDetailView(outfitId: ID)`. Embed
`OutfitPhotosSection(outfit: OutfitDetailDTO)` in detail and navigate using
`Route.suggest`; do not edit the other packages' files. Own `OutfitsModel`
and `OutfitDetailModel`, initialized with `any WardrobeAPI`; views obtain the
API and current scope from the environment. Use `outfits`,
`sharedOutfits`, `outfit`, `createOutfit`, `updateOutfit`, `deleteOutfit`,
`createOutfitShare`, and `deleteOutfitShare`. Acceptance: scoped list and
filters, ordered item builder, detail, sharing, access gating, and tests for
editing and navigation.

## WP9 — photos and Immich

Own `Features/Outfits/Photos/**`, `Features/Settings/**`,
`ios/AppTests/Immich*Tests.swift`, and `ios/AppTests/SettingsTests.swift`.
Implement `OutfitPhotosSection(outfit: OutfitDetailDTO)` in Photos and
`ImmichSettingsSection()` in Settings; retain those entry points. Own the photo and picker models, initialized with `any WardrobeAPI`;
pass the loaded outfit into the photo section and resolve app services from
the environment. Add the settings section to `SettingsView`. Use `createPhoto`, upload
and completion methods, `immichStatus`, `connectImmich`, `disconnectImmich`,
`immichAssets`, `linkImmichAssets`, `unlinkImmichAsset`, and `ImagePipeline`'s
Immich byte methods. Acceptance: uploads, picker, link/unlink, unavailable
images, connection and disconnection, and tests with fixtures.

## WP10 — suggestions

Own `Features/Outfits/Suggest/**` and `ios/AppTests/Suggest*Tests.swift`.
Implement `OutfitSuggestView()` there; retain its initializer and
provide the bulk-tagging UI in this directory. Own `OutfitSuggestModel`,
initialized with `any WardrobeAPI` and the current owner ID; the view obtains
these from the environment. Use `suggestionRuns`,
`suggestionRun`, `createSuggestionRun`, `dismissSuggestion`, `createOutfit`
with `suggestionId`, `queueBulkAnalyses` and `applyBulkTags`. Acceptance:
request, polling, save/dismiss, past runs, bulk tagging, errors and tests.
