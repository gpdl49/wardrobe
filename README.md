# wardrobe

A catalogue of clothes and where each item is: a numbered vacuum bag, a
numbered suitcase or a named closet. Built for packing and unpacking at the
change of season from a phone, and browsing from a laptop. Installable as a
PWA.

The design and the build contract (names, environment, auth headers, data
model, HTTP API, pages) live in
[`docs/wardrobe.md` in gpdl49/homestacks](https://github.com/gpdl49/homestacks/blob/main/docs/wardrobe.md).
This repository is the `projects/wardrobe` submodule there; the Kubernetes
manifests are in `clusters/centerpoint/wardrobe-system/` of that repository.

## Stack

Next.js (App Router, standalone output) · TypeScript · Tailwind · Prisma 7
with `@prisma/adapter-pg` · pg-boss (in-process jobs) · S3 presigned uploads ·
Vitest · Biome · Node 24 · pnpm.

## Local development

```sh
cp .env.example .env        # AUTH_MODE=dev, local Postgres and MinIO
docker compose up -d        # Postgres (wardrobe + wardrobe_test) and MinIO
pnpm install                # also runs `prisma generate`
pnpm db:deploy              # apply migrations
pnpm db:seed                # default category tree (only into an empty table)
pnpm dev                    # http://localhost:3000
```

`AUTH_MODE=dev` signs every request in as a fixed user (`dev`, in the
`REQUIRED_GROUP`). It is refused when `NODE_ENV=production`. In production
oauth2-proxy runs as a sidecar and the app trusts its `X-Forwarded-*`
headers (`AUTH_MODE=proxy`, the default). To try proxy mode locally, send the
headers yourself:

```sh
curl -H 'X-Forwarded-User: me' -H 'X-Forwarded-Groups: wardrobe' localhost:3000/api/me
```

## Commands

| Command | What |
|---------|------|
| `pnpm dev` | Dev server |
| `pnpm lint` / `pnpm format` | Biome check / fix |
| `pnpm typecheck` | `next typegen` + `tsc` |
| `pnpm test` | Vitest: unit tests always; Postgres tests when `TEST_DATABASE_URL` is set |
| `pnpm build` | Production build (`.next/standalone`) |
| `pnpm db:migrate` | Create a migration from `prisma/schema.prisma` changes (dev database) |
| `pnpm db:deploy` | Apply migrations |
| `pnpm db:seed` | Seed default categories |

`TEST_DATABASE_URL` must point at a throwaway database whose name contains
`test` (compose creates `wardrobe_test`): the suite drops and re-migrates it
once per run and truncates it before each test.

## Layout

```
app/                 pages and API route handlers (app/api/**/route.ts)
components/          UI components
lib/auth             oauth2-proxy header auth (requireUser)
lib/env.ts           validated environment (zod)
lib/db.ts            Prisma client
lib/s3.ts            photo object keys, presigned PUT/GET
lib/http/            error shape and the withAuth/parseBody route helpers
lib/jobs/            pg-boss queue, worker and job definitions
lib/<feature>/       schema.ts (zod) + service.ts (data access, rules)
prisma/              schema, migrations, seed.mjs
test/                integration tests and helpers
```

## Container

`Dockerfile` builds the standalone server. The entrypoint runs
`prisma migrate deploy`, seeds the default categories (only if there are
none) and starts `node server.js` on `127.0.0.1:3000`. It runs as UID 65532
with a read-only root filesystem; only `/tmp` and `/app/.next/cache` need to be
writable.

CI (`.github/workflows/ci.yaml`) lints, typechecks, tests against Postgres and
builds on `ubuntu-latest`; on `main` it then builds and pushes
`ghcr.io/gpdl49/wardrobe:main` and `:main-<sha>` with buildah on the
`homestacks-runners` ARC runners. Flux image automation in homestacks rolls it
out.
