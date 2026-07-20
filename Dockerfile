FROM node:24.14.1-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN corepack enable && corepack install -g pnpm@latest
RUN npm ci

FROM node:24.14.1-bookworm-slim AS seeder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY scripts ./scripts
CMD ["sh", "-lc", "node scripts/sync-ism.mjs && node scripts/sync-acsc-advisories.mjs"]

FROM node:24.14.1-bookworm-slim AS worker
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY scripts ./scripts
CMD ["node", "scripts/work-jobs.mjs"]

FROM node:24.14.1-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN corepack enable && corepack install -g pnpm@latest
RUN pnpm build

FROM node:24.14.1-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack install -g pnpm@latest
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/data ./data
USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
