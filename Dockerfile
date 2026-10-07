# syntax=docker/dockerfile:1

# Node 22 (LTS, maintained) — matches the "engines" range in package.json
# (>=22 <25). The previous base was node:20, which is end-of-life and outside
# the declared range.
FROM node:22-alpine AS builder

WORKDIR /app

# corepack provides the pnpm version pinned by package.json "packageManager".
RUN corepack enable

# Install with the lockfile only, so this layer caches until dependencies move.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# `pnpm build` already runs vite + the esbuild server bundle to dist/index.js.
RUN pnpm build

FROM node:22-alpine AS production

WORKDIR /app

RUN corepack enable

ENV NODE_ENV=production

# Production dependencies only, from the lockfile. helmet/pino/pino-http/
# @sentry/node are declared dependencies, so no ad-hoc `pnpm add` is needed.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile && pnpm store prune

COPY --from=builder /app/dist ./dist

# Drop privileges — the app needs no root at runtime.
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/healthz || exit 1

CMD ["node", "dist/index.js"]