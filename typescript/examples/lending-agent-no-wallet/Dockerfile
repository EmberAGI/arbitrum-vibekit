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
COPY examples/lending-agent-no-wallet/package.json ./examples/lending-agent-no-wallet/

# Install all dependencies for the workspace subset we need
# pnpm will figure out the necessary links based on workspace:* deps
RUN pnpm install --frozen-lockfile

# Copy source code for necessary workspace packages
COPY lib/a2a/ ./lib/a2a/
COPY lib/mcp-tools/emberai-mcp/ ./lib/mcp-tools/emberai-mcp/
COPY examples/lending-agent-no-wallet/src/ ./examples/lending-agent-no-wallet/src/
COPY examples/lending-agent-no-wallet/tsconfig.json ./examples/lending-agent-no-wallet/
COPY lib/mcp-tools/emberai-mcp/tsconfig.json ./lib/mcp-tools/emberai-mcp/
COPY lib/a2a/tsconfig.json ./lib/a2a/

# Build all dependencies in topological order (dependencies first, then dependents)
RUN pnpm --filter "...lending-agent-no-wallet" build

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

# Copy only what we need from the builder stage
COPY --from=builder /app/examples/lending-agent-no-wallet/dist /app/examples/lending-agent-no-wallet/dist
COPY --from=builder /app/examples/lending-agent-no-wallet/package.json /app/examples/lending-agent-no-wallet/
COPY --from=builder /app/lib/a2a/dist /app/lib/a2a/dist
COPY --from=builder /app/lib/a2a/package.json /app/lib/a2a/
COPY --from=builder /app/lib/mcp-tools/emberai-mcp/dist /app/lib/mcp-tools/emberai-mcp/dist
COPY --from=builder /app/lib/mcp-tools/emberai-mcp/package.json /app/lib/mcp-tools/emberai-mcp/
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/node_modules/.pnpm /app/node_modules/.pnpm
# Also copy the example package's direct node_modules folder to preserve local symlinks
COPY --from=builder /app/examples/lending-agent-no-wallet/node_modules /app/examples/lending-agent-no-wallet/node_modules
# Also copy the mcp-tool package's node_modules folder
COPY --from=builder /app/lib/mcp-tools/emberai-mcp/node_modules /app/lib/mcp-tools/emberai-mcp/node_modules

# Set the working directory for the final image
WORKDIR /app/examples/lending-agent-no-wallet/dist

# Change ownership to non-root user
RUN chown -R ember:ember /app

# Switch to non-root user
USER ember

# Expose port for SSE MCP server
EXPOSE 3001

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the Lending agent (path is relative to the WORKDIR set above)
CMD ["node", "index.js"] 