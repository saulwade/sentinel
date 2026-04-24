# Sentinel engine — Hono + Drizzle + better-sqlite3 on Node 22.
# Deployed to Fly.io with a persistent volume mounted at /data.
#
# Build context = repo root (pnpm workspace). The fly.toml sets
#   [build] dockerfile = "apps/engine/Dockerfile"
#   [build.args] no extra args needed
# Fly auto-runs `flyctl deploy` from the repo root.

FROM node:22-slim AS base

# Native deps for better-sqlite3 (node-gyp needs python, make, g++).
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ libc6-dev ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# pnpm via corepack (shipped with Node 22).
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /app

# Copy workspace manifests first so Docker can cache `pnpm install`.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/engine/package.json ./apps/engine/

# Install deps for engine + shared only. `--filter ...@sentinel/engine`
# gives us the engine and its workspace dependencies transitively.
RUN pnpm install --frozen-lockfile --filter @sentinel/engine...

# Copy source.
COPY packages/shared ./packages/shared
COPY apps/engine ./apps/engine

# Data dir — Fly volume mounts here.
RUN mkdir -p /data
ENV DB_PATH=/data/sentinel.db
ENV PORT=3001
EXPOSE 3001

# `pnpm start` == `node --import tsx src/index.ts` (see apps/engine/package.json)
WORKDIR /app/apps/engine
CMD ["pnpm", "start"]
