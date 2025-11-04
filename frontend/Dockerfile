# syntax=docker/dockerfile:1
# Multi-stage build optimized for Next.js with BuildKit features

FROM node:24.11.0-alpine AS base

# Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies based on the preferred package manager
# Copy only package files for better layer caching
COPY --link package.json yarn.lock* package-lock.json* pnpm-lock.yaml* ./
RUN \
    if [ -f yarn.lock ]; then yarn install --frozen-lockfile; \
    elif [ -f package-lock.json ]; then npm ci; \
    elif [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm install --frozen-lockfile; \
    else echo "Lockfile not found." && exit 1; \
    fi

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
ENV NODE_ENV=production
ENV DEPLOYMENT_MODE=standalone
# Copy node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy source files (cached separately from dependencies)
COPY --link package.json yarn.lock* package-lock.json* pnpm-lock.yaml* next.config.ts tsconfig.json .npmrc* ./
COPY --link public ./public
COPY --link src ./src

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
# Disable telemetry in production builds
ENV NEXT_TELEMETRY_DISABLED=1

# Build Next.js application
RUN \
    if [ -f yarn.lock ]; then yarn run build; \
    elif [ -f package-lock.json ]; then npm run build; \
    elif [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm run build; \
    else echo "Lockfile not found." && exit 1; \
    fi

# Drop development dependencies after the build to keep output lean
RUN [ -f package-lock.json ] && npm prune --omit=dev || true

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy public assets (needed for static files)
COPY --from=builder /app/public ./public

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
# The standalone folder contains everything needed: server.js, .next, node_modules, package.json
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

# Copy static assets into the standalone .next directory
# This is required because standalone mode doesn't include static files by default
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Switch to non-root user
USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Health check - check if Next.js is responding (not a specific endpoint)
# Use the root path since /api/health may not exist
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/', (r) => {if(r.statusCode >= 200 && r.statusCode < 500) process.exit(0); else process.exit(1);})"

# server.js is created by next build from the standalone output
# https://nextjs.org/docs/pages/api-reference/next-config-js/output
CMD ["node", "server.js"]
