# Changelog

All notable changes to wardrobe are recorded here. The web app and iOS app share one
version, following [Semantic Versioning](https://semver.org/). After 1.0.0,
[release-please](https://github.com/googleapis/release-please) writes each section from the
[Conventional Commit](https://www.conventionalcommits.org/) titles of merged PRs; see
[docs/releasing.md](docs/releasing.md#releases-maintainers).

## [1.4.0](https://github.com/gpdl49/wardrobe/compare/v1.3.0...v1.4.0) (2026-11-25)


### Added

* **catalogue:** run actions on selected items ([dba31c0](https://github.com/gpdl49/wardrobe/commit/dba31c0db2294bf1a59e084bcd68b322f8a02716))
* **catalogue:** run actions on selected items ([#44](https://github.com/gpdl49/wardrobe/issues/44)) ([29543c9](https://github.com/gpdl49/wardrobe/commit/29543c97e5ea8151c067c23a07cb189cab1ccaaa))


### Fixed

* **deps:** bump next from 16.4.4 to 16.4.5 ([#32](https://github.com/gpdl49/wardrobe/issues/32)) ([17a4889](https://github.com/gpdl49/wardrobe/commit/17a48891400e9b0e2b9a271631f684f689a81617))
* **ios:** build TestFlight archives with the iOS 27 SDK ([fe06edb](https://github.com/gpdl49/wardrobe/commit/fe06edb62574da26174b37d0669d22a2c643b014))
* **photos:** stop background removal running out of memory ([#30](https://github.com/gpdl49/wardrobe/issues/30)) ([8df5344](https://github.com/gpdl49/wardrobe/commit/8df53446ecf4d367c0fe877376753602f75d67fa))

## [1.3.0](https://github.com/gpdl49/wardrobe/compare/v1.2.0...v1.3.0) (2026-11-20)


### Added

* **photos:** remove backgrounds on any backdrop with BiRefNet ([#24](https://github.com/gpdl49/wardrobe/issues/24)) ([300c634](https://github.com/gpdl49/wardrobe/commit/300c63414ebffc0e67c72ba0a80530f17ec8c8c4))


### Fixed

* **ios:** point confirmation popovers at the button that opened them ([#26](https://github.com/gpdl49/wardrobe/issues/26)) ([a2c3a72](https://github.com/gpdl49/wardrobe/commit/a2c3a727824e06c8d4321f50d0573ddc940a7fb9))

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
