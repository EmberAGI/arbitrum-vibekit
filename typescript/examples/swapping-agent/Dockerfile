# Build stage - Context should be the typescript/ directory
FROM node:20-slim AS builder

WORKDIR /app

# Install pnpm globally
RUN npm install -g pnpm@10.7.0 typescript@5.8.3

# ------------------------------
# 1. Copy lockfile & workspace config that affect dependency graph cache
# ------------------------------
COPY pnpm-lock.yaml* pnpm-workspace.yaml .npmrc ./
# Copy root package.json for pnpm workspace
COPY package.json ./
# Copy base TS configuration so that tsconfig.base.json can be resolved
COPY tsconfig.base.json ./

# ------------------------------
# 2. Copy all workspace package.json files (to maximise Docker cache)
# ------------------------------
COPY lib/mcp-tools/emberai-mcp/package.json ./lib/mcp-tools/emberai-mcp/
COPY examples/swapping-agent/package.json ./examples/swapping-agent/

# ------------------------------
# 3. Install deps based on the copied package.json set. This is cache-friendly and establishes workspace links.
# ------------------------------
RUN pnpm install --prefer-frozen-lockfile

# ------------------------------
# 4. Now copy the rest of the source code
# ------------------------------
COPY . .

# ------------------------------
# 5. Build every workspace package that provides a build script (recursive build)
# ------------------------------
RUN pnpm -r --if-present build

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
RUN npm install -g pnpm@10.7.0

# Copy only what we need from the builder stage
COPY --from=builder /app/examples/swapping-agent/dist /app/examples/swapping-agent/dist
COPY --from=builder /app/examples/swapping-agent/package.json /app/examples/swapping-agent/
COPY --from=builder /app/lib/mcp-tools/emberai-mcp/dist /app/lib/mcp-tools/emberai-mcp/dist
COPY --from=builder /app/lib/mcp-tools/emberai-mcp/package.json /app/lib/mcp-tools/emberai-mcp/
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/node_modules/.pnpm /app/node_modules/.pnpm
# Also copy the example package's direct node_modules folder to preserve local symlinks
COPY --from=builder /app/examples/swapping-agent/node_modules /app/examples/swapping-agent/node_modules
# Also copy the mcp-tool package's node_modules folder
COPY --from=builder /app/lib/mcp-tools/emberai-mcp/node_modules /app/lib/mcp-tools/emberai-mcp/node_modules

# Set the working directory for the final image
WORKDIR /app/examples/swapping-agent/dist

# Change ownership to non-root user
RUN chown -R ember:ember /app

# Switch to non-root user
USER ember

# Expose port for SSE MCP server
EXPOSE 3001

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the Swapping agent (path is relative to the WORKDIR set above)
CMD ["node", "index.js"]