# Build stage - Context should be the typescript/ directory
FROM node:20-slim AS builder

WORKDIR /app

# Install dependencies
# Note: We don't install TypeScript globally as it's already in project dependencies
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* && \
    npm install -g pnpm@10.7.0

# Copy everything
# The build context is the entire typescript/ directory to support pnpm workspaces
COPY . .

# Install all dependencies
# This creates symlinks between workspace packages as pnpm normally does
RUN pnpm install --frozen-lockfile

# Build only the necessary workspace packages
# The "..." suffix tells pnpm to build swapping-agent-no-wallet and all its dependencies
# This is more efficient than building the entire monorepo
RUN pnpm --filter swapping-agent-no-wallet... build

# Deploy the specific package with its dependencies
# pnpm deploy creates a production-ready bundle without symlinks, perfect for Docker
# force-legacy-deploy is required because the root package.json has pnpm.overrides
# which causes issues with the default deploy mode in monorepos
RUN pnpm config set force-legacy-deploy true && \
    pnpm --filter=swapping-agent-no-wallet deploy --prod deploy-output

# Production stage
FROM node:20-slim AS production

# Create a non-root user for security
RUN apt-get update && apt-get install -y --no-install-recommends dumb-init && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* && \
    groupadd -r ember && useradd -r -g ember ember

# Copy the deployed application
# The deploy-output directory contains a self-contained application with all dependencies
# including workspace packages, properly resolved without symlinks
COPY --from=builder /app/deploy-output /app

WORKDIR /app

# Change ownership to non-root user
RUN chown -R ember:ember /app

# Switch to non-root user
USER ember

# Expose port for SSE MCP server
EXPOSE 3001

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the Swapping agent
# The deployed bundle has the same structure as the original package
CMD ["node", "dist/index.js"]