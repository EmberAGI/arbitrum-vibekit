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
COPY lib/ lib/
COPY community/pendle-agent/package.json ./community/pendle-agent/

# ------------------------------
# 3. Install deps based on the copied package.json set. Skip lifecycle scripts for now
#    because source files are not yet in the build context (they are copied in step 4).
#    This keeps the layer cache-friendly while avoiding prepare/postinstall failures.
# ------------------------------
RUN pnpm install --prefer-frozen-lockfile

# ------------------------------
# 4. Now copy the rest of the source code
# ------------------------------
COPY . .

# ------------------------------
# 5. Build every workspace package that provides a build script (recursive build)
# ------------------------------
RUN pnpm --filter pendle-agent-example... build

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
COPY --from=builder /app/community/pendle-agent/dist /app/community/pendle-agent/dist
COPY --from=builder /app/community/pendle-agent/package.json /app/community/pendle-agent/
COPY --from=builder /app/community/pendle-agent/node_modules /app/community/pendle-agent/node_modules
COPY --from=builder /app/lib /app/lib
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/node_modules/.pnpm /app/node_modules/.pnpm

# Set the working directory for the final image
WORKDIR /app/community/pendle-agent/dist

# Change ownership to non-root user
RUN chown -R ember:ember /app

# Switch to non-root user
USER ember

# Expose port for SSE MCP server
EXPOSE 3001

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the Pendle agent (path is relative to the WORKDIR set above)
CMD ["node", "index.js"] 