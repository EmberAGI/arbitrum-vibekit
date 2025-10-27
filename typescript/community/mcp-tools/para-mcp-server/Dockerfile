# syntax=docker/dockerfile:1

###############################################
# Builder: Use Node with pnpm for proper package installation
###############################################
FROM docker.io/library/node:20-bookworm-slim AS base
WORKDIR /app

# Enable pnpm via Corepack
RUN corepack enable && corepack prepare pnpm@latest --activate

# 1) Dependencies for build (with dev deps)
FROM base AS deps
COPY package.json ./
RUN pnpm install

# 2) Build
FROM base AS builder
WORKDIR /app
# Install deps in this stage to avoid broken pnpm store links
COPY package.json ./
RUN pnpm install
COPY . .
ENV PATH=/app/node_modules/.bin:$PATH
# Build xmcp first (generates .xmcp folder), then Next.js
RUN pnpm dlx xmcp@0.3.5 build && \
    pnpm build

# 3) Production deps only (lean runtime node_modules)
FROM base AS prod-deps
WORKDIR /app
COPY package.json ./
RUN pnpm install --prod

###############################################
# Runtime: Use Node on Debian (glibc)
###############################################
FROM docker.io/library/node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Default port for this service
ENV PORT=3012
EXPOSE 3012

# Copy only the artifacts needed at runtime
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/.xmcp ./.xmcp
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Run the Next.js server (Next respects PORT env)
CMD ["node", "node_modules/next/dist/bin/next", "start"]
