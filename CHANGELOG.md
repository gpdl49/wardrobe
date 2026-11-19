# Changelog

All notable changes to wardrobe are recorded here. The web app and iOS app share one
version, following [Semantic Versioning](https://semver.org/). After 1.0.0,
[release-please](https://github.com/googleapis/release-please) writes each section from the
[Conventional Commit](https://www.conventionalcommits.org/) titles of merged PRs; see
[docs/releasing.md](docs/releasing.md#releases-maintainers).

## [1.2.0](https://github.com/gpdl49/wardrobe/compare/v1.1.0...v1.2.0) (2026-11-19)


### Added

* **analyses:** tag garment attributes from closed lists ([#14](https://github.com/gpdl49/wardrobe/issues/14)) ([9c11e6e](https://github.com/gpdl49/wardrobe/commit/9c11e6eb720844fad9c1c5f2398e6741bab4d5ca))
* **items:** automatically name clothes from photos ([#17](https://github.com/gpdl49/wardrobe/issues/17)) ([3843734](https://github.com/gpdl49/wardrobe/commit/3843734489f061fbaa8b2db19764820353b327e0))
* **locations:** add vacuum bags ([#19](https://github.com/gpdl49/wardrobe/issues/19)) ([05232ed](https://github.com/gpdl49/wardrobe/commit/05232ed3e041dfb3a1215e2e768d23c92c8c54e4))
* **photos:** crop background cutouts to the garment ([#21](https://github.com/gpdl49/wardrobe/issues/21)) ([5490704](https://github.com/gpdl49/wardrobe/commit/54907045036decf439ad2a6c5449778db5273bec))
* **photos:** queue background removal on demand ([edf4c73](https://github.com/gpdl49/wardrobe/commit/edf4c7364b6a1269b6e19aa72a216e032d1b4ecc))


### Fixed

* **ios:** keep iPad toolbar actions out of overflow ([#18](https://github.com/gpdl49/wardrobe/issues/18)) ([5050387](https://github.com/gpdl49/wardrobe/commit/50503878e7ebeeec8704561cc31d99a243c8fe00))
* **ios:** replace crop sliders with Mantis editor ([#15](https://github.com/gpdl49/wardrobe/issues/15)) ([32438cc](https://github.com/gpdl49/wardrobe/commit/32438cc8234db7b30251cbd468e33ea2879a5bdf))

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
