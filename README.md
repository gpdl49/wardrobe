# wardrobe

A catalogue of each user's clothes and where each item is: a numbered vacuum
bag, a numbered suitcase or a named closet. Wardrobes are private by default
and can be shared. Built for packing and unpacking at the change of season from
a phone, and browsing from a laptop. Installable as a PWA.

The design and the build contract (names, environment, auth headers, data
model, HTTP API, pages) live in
[`docs/wardrobe.md` in gpdl49/homestacks](https://github.com/gpdl49/homestacks/blob/main/docs/wardrobe.md).
This repository is the `projects/wardrobe` submodule there; the Kubernetes
manifests are in `clusters/centerpoint/wardrobe-system/` of that repository.

## Stack

Next.js (App Router, standalone output) · TypeScript · Tailwind · Prisma 7
with `@prisma/adapter-pg` · pg-boss (in-process jobs) · S3 presigned uploads ·
Vitest · Biome · Node 24 · [aube](https://aube.sh).

## Local development

Needs Node 24 and aube. With [mise](https://mise.jdx.dev):

```sh
mise install
mise run setup              # aube install + hk install (git hooks)
```

Without mise: install Node 24 and aube, then `aube install` and `hk install`.

```sh
cp .env.example .env        # AUTH_MODE=dev, local Postgres and MinIO
docker compose up -d        # Postgres (wardrobe + wardrobe_test) and MinIO
aubr db:deploy              # apply migrations
aubr db:seed                # default category tree (only into an empty table)
aubr dev                    # http://localhost:3000
```

`AUTH_MODE=dev` signs every request in as a fixed user (`dev`, in the
`REQUIRED_GROUP` and the `ADMIN_GROUP`). It is refused when `NODE_ENV=production`. In production
oauth2-proxy runs as a sidecar and the app trusts its `X-Forwarded-*`
headers (`AUTH_MODE=proxy`, the default). To try proxy mode locally, send the
headers yourself:

```sh
curl -H 'X-Forwarded-User: me' -H 'X-Forwarded-Groups: wardrobe' localhost:3000/api/me
```

## Users and sharing

A user's row is created from the proxy headers the first time they sign in.
Locations, items, photos, packing sessions and tags each belong to one owner,
so codes and tag names only need to be unique per owner.

An owner shares their whole wardrobe, or one location and everything nested in
it, as `view` or `edit` (`/api/shares`). The other person must have signed in
once, and is found by email or username. Without access a row is a 404; a write
with view access is a 403. Only the owner manages shares. QR labels encode
`/l/<ownerId>/<code>`, so a label always means one owner's location.

Categories are one global tree that only members of `ADMIN_GROUP` (default
`wardrobe-admin`) can change.

`AUTH_MODE=dev` has just one user. To try sharing locally, set
`AUTH_MODE=proxy` and act as two users:

```sh
as() { curl -s -H "X-Forwarded-User: $1" -H "X-Forwarded-Email: $1@example.com" \
  -H 'X-Forwarded-Groups: wardrobe' -H 'Content-Type: application/json' "${@:2}"; }

as bob localhost:3000/api/me   # signs bob in, so he can be found
as anna localhost:3000/api/shares -d '{"grantee":"bob@example.com","access":"view"}'
as bob localhost:3000/api/shared-with-me
```

## Commands

| Command | What |
|---------|------|
| `aubr dev` | Dev server |
| `aube run lint` / `format` | Biome check / fix (`aubr` auto-installs when needed) |
| `aube run typecheck` | `next typegen` + `tsc` |
| `aube test` | Vitest: unit tests always; Postgres tests when `TEST_DATABASE_URL` is set |
| `aubr build` | Production build (`.next/standalone`) |
| `aube run db:migrate` | Create a migration from `prisma/schema.prisma` changes (dev database) |
| `aube run db:deploy` | Apply migrations |
| `aube run db:seed` | Seed default categories |

`TEST_DATABASE_URL` must point at a throwaway database whose name contains
`test` (compose creates `wardrobe_test`): the suite drops and re-migrates it
once per run and truncates it before each test.

## Layout

```
app/                 pages and API route handlers (app/api/**/route.ts)
components/          UI components
lib/auth             oauth2-proxy header auth (requireUser), users rows
lib/access           who may read or edit what (loadAccess, requireEdit, ...)
lib/shares           sharing a wardrobe or location with another user
lib/env.ts           validated environment (zod)
lib/db.ts            Prisma client
lib/s3.ts            photo object keys, presigned PUT/GET
lib/http/            error shape and the withAuth/parseBody route helpers
lib/jobs/            pg-boss queue, worker and job definitions
lib/<feature>/       schema.ts (zod) + service.ts (data access, rules)
prisma/              schema, migrations, seed.mjs
test/                integration tests and helpers
```

## Photos

`POST /api/photos` creates a `pending` photo and returns a presigned PUT for
`photos/<id>/original`; the browser uploads, then calls
`POST /api/photos/{id}/complete`, which checks the object (HEAD) and queues
the `photo.renditions` job. The job writes `display.webp` (1600 px) and
`thumb.webp` (400 px) with sharp, oriented and without metadata, records
dimensions and blurhash, marks the photo `ready`, gives its item a cover if it has
none and calls `onPhotoReady` (`lib/photos/hooks.ts`). `PATCH /api/photos/{id}`
assigns a packing capture to an item or changes its kind.

HEIC/HEIF is not decoded server-side: sharp's prebuilt libvips (also on
linux-musl) ships libheif without an HEVC decoder. The API answers 422
`unsupported_format`; the browser converts to JPEG before uploading.

## Container

`Dockerfile` builds the standalone server. The entrypoint runs
`prisma migrate deploy`, seeds the default categories (only if there are
none) and starts `node server.js` on `127.0.0.1:3000`. It runs as UID 65532
with a read-only root filesystem; only `/tmp` and `/app/.next/cache` need to be
writable.

CI (`.github/workflows/ci.yaml`) lints, typechecks, tests against Postgres and
builds on `ubuntu-latest`; on `main` it then builds and pushes
`ghcr.io/gpdl49/wardrobe:main` and `:main-<sha>` with buildah, also on
GitHub-hosted runners (the repo is public, so they're free; the self-hosted
ARC runners serve private repos only). Flux image automation in homestacks rolls it
out.

## iOS app

Wardrobe has a companion native iOS app for iPhone and iPad (SwiftUI, iOS 26+).
See [docs/ios/](docs/ios/) for architecture, development plan, and setup.

## Releases

Versioned releases of the web app, container image and iOS app are described in
[docs/releasing.md](docs/releasing.md).
