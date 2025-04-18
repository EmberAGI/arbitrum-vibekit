# Build stage - Context should be the typescript/ directory
FROM node:20-slim AS builder

WORKDIR /app

# Install pnpm globally
RUN npm install -g pnpm typescript@5.8.3

# Copy workspace definition, lockfile and pnpm config
COPY pnpm-lock.yaml* pnpm-workspace.yaml .npmrc ./
# Copy root package.json for pnpm workspace
COPY package.json ./
# Copy base TS configuration so that tsconfig.base.json can be resolved
COPY tsconfig.base.json ./

# Copy package.json files for necessary workspace packages
# (Adjust paths if your mcp-tool location is different)
COPY lib/a2a/package.json ./lib/a2a/
COPY lib/mcp-tools/emberai-mcp/package.json ./lib/mcp-tools/emberai-mcp/
COPY examples/swapping-agent-no-wallet/package.json ./examples/swapping-agent-no-wallet/

# Install all dependencies for the workspace subset we need
# pnpm will figure out the necessary links based on workspace:* deps
RUN pnpm install --frozen-lockfile

# Copy source code for necessary workspace packages
COPY lib/a2a/ ./lib/a2a/
COPY lib/mcp-tools/emberai-mcp/ ./lib/mcp-tools/emberai-mcp/
COPY examples/swapping-agent-no-wallet/src/ ./examples/swapping-agent-no-wallet/src/
COPY examples/swapping-agent-no-wallet/tsconfig.json ./examples/swapping-agent-no-wallet/
COPY lib/mcp-tools/emberai-mcp/tsconfig.json ./lib/mcp-tools/emberai-mcp/
COPY lib/a2a/tsconfig.json ./lib/a2a/

# Build all dependencies in topological order (dependencies first, then dependents)
RUN pnpm --filter "...swapping-agent-no-wallet" build

# Production stage
FROM node:20-slim AS production

# Copy pnpm config
COPY --from=builder /app/.npmrc ./

# Create a non-root user
RUN apt-get update && apt-get install -y --no-install-recommends dumb-init && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* && \
    groupadd -r ember && useradd -r -g ember ember

WORKDIR /app

# Install pnpm globally
RUN npm install -g pnpm

# Copy necessary files from the build stage using pnpm deploy
# This copies only prod dependencies and built artifacts for the target package
COPY --from=builder /app ./
# Ensure deploy target is empty so pnpm deploy (v10) will succeed
RUN rm -rf examples/swapping-agent-no-wallet/dist
RUN pnpm deploy --filter swapping-agent-no-wallet --prod examples/swapping-agent-no-wallet/dist

# Set the working directory for the final image
WORKDIR /app/examples/swapping-agent-no-wallet/dist

# Copy .env file relative to the example directory (if needed at runtime)
# Note: It's generally better to pass secrets via environment variables
# COPY examples/swapping-agent-no-wallet/.env* ./

# Change ownership to non-root user
# Need to adjust the path for chown after deploy
RUN chown -R ember:ember /app

# Switch to non-root user
USER ember

# Expose port for SSE MCP server
EXPOSE 3001

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the Swapping agent (path is relative to the WORKDIR set above)
CMD ["node", "index.js"]