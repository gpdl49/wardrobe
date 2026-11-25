# Releases

The web app, container image and iOS app share one [semver](https://semver.org/)
version in `package.json`, `ios/project.yml` (`MARKETING_VERSION`) and
`.release-please-manifest.json`. [release-please](https://github.com/googleapis/release-please)
keeps them in sync via `release-please-config.json`.

## How a release flows

1. Every push to `main` updates an open **chore: release x.y.z** PR. It bumps the
   three version files and appends a `CHANGELOG.md` section from Conventional Commits
   merged since the last release. At 1.x, `feat` is a minor bump, `fix` / `perf` a
   patch, and `feat!` or a `BREAKING CHANGE:` footer a major.
2. Review the PR (you can edit the changelog in the PR body before merge). Merge it
   when ready. release-please tags `vx.y.z`, creates a **draft** GitHub Release, and
   dispatches `release.yaml` on the tag.
3. `release.yaml` checks that the tag matches all version files and `CHANGELOG.md`,
   builds and pushes `ghcr.io/gpdl49/wardrobe:x.y.z` and `:x.y` (no `:x.y` for
   pre-releases), then publishes the release with the changelog section as notes.
4. The same merge to `main` changes `ios/project.yml`, so `.github/workflows/ios.yaml`
   uploads that marketing version to TestFlight. Build numbers are the `ios.yaml` run
   number. Every push to `main` still publishes `:main` images via `ci.yaml`.
5. **`Release-As: x.y.z`** in a commit message on `main` (an empty `chore:` commit
   works) pins the next release version.
6. **Trial build:** run `release.yaml` manually on a branch. It builds the image
   locally on the runner but does not push or publish (`x.y.z-dev.<run>`).

`ghcr.io/gpdl49/wardrobe:main` continues to track `main` for homestacks; version tags
are for pinned rollouts and release notes.

## Releases (maintainers)

### First release (v1.0.0)

release-please does nothing until the repository has at least one GitHub Release. Cut
**v1.0.0 once by hand** after the release automation PR merges:

```sh
git tag -s v1.0.0 -m v1.0.0 <merge-sha>
git push origin v1.0.0
```

`release.yaml` builds the image and publishes the release from the curated `## [1.0.0]`
section in `CHANGELOG.md`. The next push to `main` lets release-please open the
**chore: release 1.0.1** (or next) PR.

### CI on release PRs

A PR opened with `GITHUB_TOKEN` gets no workflow runs, so `release-please` opens the
release PR as the `gpdl49-release` GitHub App. homestacks (`terraform/github`) sets the
`RELEASE_APP_CLIENT_ID` variable and `RELEASE_APP_PRIVATE_KEY` secret here, and the App
is installed on selected repositories only. Without them the workflow falls back to
`GITHUB_TOKEN`, and the PR's runs need manual approval.

### Merge settings

This repository currently merges PRs with merge commits. release-please then reads
every commit on the merged branch; GitHub’s `Merge pull request …` commits are
ignored, but feature commits must still be Conventional Commits (the hk `commit-msg`
hook enforces this locally).

**Recommended (as in vidurb/pux):** allow only squash merges and use the PR title as
the squash commit message (*Settings → General → Pull requests*). The `pr-title`
workflow is written for that model. We do not change the setting from automation.

### When a release build fails

The GitHub Release stays a **draft** until `release.yaml` succeeds. Re-run failed
jobs. If the fix needs code, merge it as `fix: …`, let release-please open the next
patch release PR, and delete the unpublished draft for the bad tag if needed.
