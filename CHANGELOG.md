# Changelog

All notable changes to wardrobe are recorded here. The web app and iOS app share one
version, following [Semantic Versioning](https://semver.org/). After 1.0.0,
[release-please](https://github.com/googleapis/release-please) writes each section from the
[Conventional Commit](https://www.conventionalcommits.org/) titles of merged PRs; see
[docs/releasing.md](docs/releasing.md#releases-maintainers).

## [1.1.0](https://github.com/gpdl49/wardrobe/compare/v1.0.0...v1.1.0) (2026-11-15)


### Added

* **ios:** crop photos before upload ([9e75323](https://github.com/gpdl49/wardrobe/commit/9e75323ec755ed6ee3d23609c201b1f0f34dba47))
* outfits, Immich photos and AI suggestions ([#11](https://github.com/gpdl49/wardrobe/issues/11)) ([a69af37](https://github.com/gpdl49/wardrobe/commit/a69af37c219e31f134f863d7d8b6905079c091e1))

## [1.0.0] - 2026-11-15

### Added

- Private per-user wardrobes with view and edit sharing by email or username
- Locations, items, photos, packing sessions and printable QR label sheets
- Pack and unpack flows with a rapid capture loop and background photo uploads
- `/l/<owner>/<code>` deep links for pack and unpack from scanned labels
- Idempotent `POST` APIs for items, photos and sessions via `Idempotency-Key`
- Photo upload with presigned S3 PUT, renditions, blurhash and optional vision analyses
- Native iOS app for iPhone and iPad (catalogue, locations, pack/unpack, sharing, TestFlight CI)

### Fixed

- HEIC uploads rejected or converted client-side when the server cannot decode them
- Upload queue retries when `/complete` finds the object missing on S3
