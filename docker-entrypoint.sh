#!/bin/sh
# Apply migrations and seed defaults, then start the server. Both steps are
# idempotent; a failure stops the container before it serves traffic.
set -eu

node node_modules/prisma/build/index.js migrate deploy
node prisma/seed.mjs

exec node server.js
