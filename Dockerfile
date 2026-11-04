# syntax=docker/dockerfile:1

# ---- base: shared settings -------------------------------------------------------
FROM node:26.13.0-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1 \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH
WORKDIR /app

# ---- pnpm: corepack provisions the exact pnpm pinned in package.json -------------
FROM base AS pnpm
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN corepack install

# ---- deps: full dependency tree for the Next.js build ----------------------------
FROM pnpm AS deps
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ---- prod-deps: runtime dependencies only (seeder / worker) ----------------------
FROM pnpm AS prod-deps
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod

# ---- scripts: shared runtime for the sync seeder and BullMQ worker ---------------
FROM base AS scripts
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY package.json ./
COPY scripts ./scripts
# Bundled snapshot so the image works without a bind mount; compose mounts ./data over it.
COPY --chown=node:node data ./data
USER node

FROM scripts AS seeder
# Run both syncs even if the first fails; exit non-zero if either failed.
CMD ["sh", "-c", "node scripts/sync-ism.mjs; ism=$?; node scripts/sync-acsc-advisories.mjs; acsc=$?; [ $ism -eq 0 ] && [ $acsc -eq 0 ]"]

FROM scripts AS worker
CMD ["node", "scripts/work-jobs.mjs"]

# ---- builder: Next.js standalone build -------------------------------------------
FROM pnpm AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p public && pnpm build

# ---- runner: minimal production web server (default target) ----------------------
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    ISM_DATA_DIR=/app/data/ism \
    ACSC_DATA_DIR=/app/data/acsc
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs
# Application files stay root-owned (read-only to the nextjs user).
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/data ./data
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
