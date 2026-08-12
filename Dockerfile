# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Rattle-Snake V2 — single image, two targets.
#   TARGET=api  -> runs the Hono backend (node apps/api/dist/index.js)
#   TARGET=web  -> runs the Astro SSR server (node apps/web/dist/server/entry.mjs)
# Build both binaries in one stage; the entrypoint picks the runtime.
# ---------------------------------------------------------------------------

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

# ---- deps: install from lockfile (needs only the manifests) ----------------
FROM base AS deps
COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

# ---- build: full source, compile everything ---------------------------------
FROM deps AS build
COPY . .
RUN pnpm run build

# ---- runner: production image ------------------------------------------------
FROM node:22-bookworm-slim AS runner
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app ./

ARG TARGET=api
ENV TARGET=$TARGET
ENV HOST=0.0.0.0
ENV PORT=4321

EXPOSE 8787
EXPOSE 4321

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

CMD ["/entrypoint.sh"]
