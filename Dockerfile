# syntax=docker/dockerfile:1@sha256:4edf897a3ffa55b89f906fc8cc78afdb3f1834cc9c7083565e611a8a7d5fe99e

# Runs in the Deployment as UID 65532 with a read-only root filesystem; only
# /tmp and /app/.next/cache are writable (docs/wardrobe.md). Nothing below
# writes anywhere else at runtime.

FROM node:26-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS base
ARG AUBE_VERSION=2.9.0
ENV NEXT_TELEMETRY_DISABLED=1
RUN apk add --no-cache curl \
  && arch="$(uname -m)" \
  && case "$arch" in \
    x86_64) target=x86_64-unknown-linux-musl ;; \
    aarch64) target=aarch64-unknown-linux-musl ;; \
    *) echo "unsupported arch: $arch" >&2; exit 1 ;; \
  esac \
  && curl -fsSL "https://github.com/aubepkg/aube/releases/download/v${AUBE_VERSION}/aube-v${AUBE_VERSION}-${target}.tar.gz" \
  | tar -xz -C /usr/local/bin aube aubr aubx

# All dependencies, for the build. postinstall runs `prisma generate`.
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc prisma.config.ts ./
COPY prisma ./prisma
RUN CI=true aube install --frozen-lockfile
COPY scripts/fetch-photo-model.mjs ./scripts/
RUN node scripts/fetch-photo-model.mjs

# Production dependencies only: the runtime needs the Prisma CLI (with its
# schema engine) for `migrate deploy` and pg for the seed.
FROM base AS prod-deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc prisma.config.ts ./
COPY prisma ./prisma
RUN CI=true aube install --prod --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY . .
COPY --from=deps /app/node_modules ./node_modules
# The generated client (gitignored) was written in the deps stage's tree.
RUN aube exec prisma generate && aube run --no-install build

FROM node:26-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=127.0.0.1 \
    PORT=3000 \
    # The root filesystem is read-only: anything that wants a home or cache
    # directory (Prisma CLI, npm-style tooling) gets /tmp.
    HOME=/tmp \
    XDG_CACHE_HOME=/tmp/.cache \
    CHECKPOINT_DISABLE=1 \
    PRISMA_HIDE_UPDATE_MESSAGE=1 \
    # Prisma loads prisma.config.ts through jiti; skip its on-disk cache.
    JITI_FS_CACHE=false
# Files stay root-owned and world-readable; the app never writes to them.
COPY --from=builder /app/.next/standalone ./
# Standalone tracing only keeps what server.js imports; the entrypoint also
# needs the Prisma CLI and pg, so overlay the full production install.
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=deps /app/models ./models
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --chmod=0555 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
USER 65532:65532
EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
