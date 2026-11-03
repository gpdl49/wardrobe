# syntax=docker/dockerfile:1@sha256:4edf897a3ffa55b89f906fc8cc78afdb3f1834cc9c7083565e611a8a7d5fe99e

# Runs in the Deployment as UID 65532 with a read-only root filesystem; only
# /tmp and /app/.next/cache are writable (docs/wardrobe.md). Nothing below
# writes anywhere else at runtime.

FROM node:24-alpine@sha256:8a32c8cf649a49915a66e81e7a609223c708d0adabf288ee3f4077d765542f85 AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NEXT_TELEMETRY_DISABLED=1
# Corepack runs pnpm 11+ (pure ESM) only from 0.34.5, bundled since Node 24.12.
RUN corepack enable

# All dependencies, for the build. postinstall runs `prisma generate`.
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./
COPY prisma ./prisma
RUN CI=true pnpm install --frozen-lockfile

# Production dependencies only: the runtime needs the Prisma CLI (with its
# schema engine) for `migrate deploy` and pg for the seed.
FROM base AS prod-deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./
COPY prisma ./prisma
RUN CI=true pnpm install --frozen-lockfile --prod

FROM base AS builder
WORKDIR /app
COPY . .
COPY --from=deps /app/node_modules ./node_modules
# The generated client (gitignored) was written in the deps stage's tree.
RUN pnpm exec prisma generate && pnpm build

FROM node:24-alpine@sha256:8a32c8cf649a49915a66e81e7a609223c708d0adabf288ee3f4077d765542f85 AS runner
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
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --chmod=0555 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
USER 65532:65532
EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
