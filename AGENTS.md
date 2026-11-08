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
