# wardrobe: agent notes

- **Setup:** `mise install` then `mise run setup` (`aube install` + `hk install`). Node
  comes from `.node-version` (mise idiomatic file; also used by CI). aube version
  comes from `packageManager` in `package.json`; lockfile stays `pnpm-lock.yaml`
  (`.npmrc`: `default-lockfile=pnpm-lock.yaml`). Pre-commit runs Biome and
  jactionlint on staged files; pre-push runs typecheck.
- **Contract first.** `docs/wardrobe.md` in gpdl49/homestacks is the build
  contract (names, env vars, headers, data model, HTTP API, pages, object
  keys). Follow it exactly; if something must change, change the doc there
  first and say so.
- **Tests with every change.** Unit tests next to the code (`lib/**/*.test.ts`);
  API and database tests in `test/` against a real Postgres
  (`TEST_DATABASE_URL`, see `test/helpers/`). Run `aube run --no-install lint`,
  `typecheck`, `test` and `build` before committing.
- **API routes** use `withAuth` + `parseBody`/`parseQuery` from `lib/http/handler`,
  validate with zod (`lib/<feature>/schema.ts`), keep data access and rules in
  `lib/<feature>/service.ts`, and throw `ApiError`s (`lib/http/errors`) so
  every error is `{error, message}`. `app/api/locations` is the reference.
- **Access**: services take the viewer first and check every read and write
  through `lib/access`; no access is a 404, view access on a write a 403.
- **Schema changes** go through a Prisma migration (`aube run --no-install db:migrate`);
  never edit an applied migration.
- **Jobs**: add a definition under `lib/jobs/definitions/`, register it in
  `lib/jobs/registry.ts`, enqueue with `enqueue(def, data)`.
- **Runtime constraints**: the container is read-only except `/tmp` and
  `/app/.next/cache`, runs as UID 65532 and listens on `127.0.0.1:3000`.
- Pin dependencies to exact versions; pin images by digest.

Commands: `aubr dev | aube run lint | format | typecheck | test | build | db:migrate | db:deploy | db:seed` (or `aube run --no-install …` after install).

# Commit messages and PR titles

[release-please](release-please-config.json) reads commit messages on `main` to choose
the next version and write `CHANGELOG.md`, so every commit message and PR title must be
a [Conventional Commit](https://www.conventionalcommits.org/):

```text
type(scope): summary
```

- **Type** decides the release. At 1.x, `feat` raises the minor version, and `fix` and
  `perf` raise the patch. `revert` is accepted too. `docs`, `refactor`, `test`, `build`,
  `ci`, `chore` and `style` don't release and stay out of the changelog. Pick by effect
  on users: a security fix is `fix`, a CI-only change is `ci`, and dependency updates that
  ship in the image or apps are `fix(deps)`.
- **Scope** is optional but expected. Use one from history or an obvious area: `api`,
  `ui`, `ios`, `pack`, `unpack`, `labels`, `upload`, `client`, `db`, `jobs`, `photos`,
  `analysis`, `s3`, `shares`, `ci`, `deps`, `chore`.
- **Summary** is lowercase, imperative and has no trailing period. It becomes the
  changelog line, so describe the change for users rather than the files:
  `fix(ios): keep pack uploads after sign-out`, not `fix: update PackView.swift`.
- **Breaking changes:** add `!` after the type and a `BREAKING CHANGE: …` footer
  explaining the migration, for example an HTTP API or payload change an older iOS
  build cannot handle.
- **Body** (optional) explains why. Wrap it at 72 characters.

Keep the PR title in the same format when squash merges are used; with merge commits,
every commit on the branch must be conventional. The `pr-title` workflow checks PR
titles and single-commit messages.

Don't edit `CHANGELOG.md`, `package.json` `version`, `ios/project.yml`
`MARKETING_VERSION`, or `.release-please-manifest.json` by hand; the release PR does
that. The exception is cutting v1.0.0 ([docs/releasing.md](docs/releasing.md)).

The hk `commit-msg` hook rejects messages that don't parse. `mise run setup` installs
it; in an existing checkout run `hk install` once. Don't bypass the hook with
`--no-verify` or `HK=0`.

Releases: [docs/releasing.md](docs/releasing.md).
