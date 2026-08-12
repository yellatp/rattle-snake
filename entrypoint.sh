#!/bin/sh
set -e

# Runs the requested Rattle-Snake target inside the container.
#   TARGET=api -> Hono backend
#   TARGET=web -> Astro SSR frontend
if [ "$TARGET" = "web" ]; then
  exec node apps/web/dist/server/entry.mjs
else
  exec node apps/api/dist/index.js
fi
