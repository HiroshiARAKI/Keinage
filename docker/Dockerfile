FROM node:20-slim AS base

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /app

# ---- deps: install production + dev dependencies ----
FROM base AS deps

# Install build tools for packages that may fall back to native compilation.
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ---- prod-deps: keep runtime dependencies available for the standalone server and migration runner ----
FROM deps AS prod-deps
RUN pnpm prune --prod

# ---- build: compile Next.js app ----
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN pnpm build

# ---- runner: minimal production image ----
FROM base AS runner
ENV NODE_ENV=production

# ffprobe is used at upload time to enforce video resolution limits.
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg ca-certificates openssl && \
    update-ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone server
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/resources/openweather ./resources/openweather

# Copy drizzle migrations + migration runner
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/docker/migrate.cjs ./migrate.cjs
COPY --from=builder /app/docker/cleanup-audit-logs.cjs ./cleanup-audit-logs.cjs
COPY --from=builder /app/docker/maintenance-cleanup.cjs ./maintenance-cleanup.cjs
COPY --from=builder /app/docker/entrypoint.sh ./entrypoint.sh

# Create writable directory for runtime uploads
RUN mkdir -p uploads && \
    chown -R nextjs:nodejs uploads

USER nextjs

EXPOSE 3000

ENV HOSTNAME="0.0.0.0"
ENV PORT=3000

ENTRYPOINT ["./entrypoint.sh"]
