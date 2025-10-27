# Build stage - Context should be the typescript/ directory
FROM node:23-slim

RUN apt-get update && apt-get install -y --no-install-recommends dumb-init git ca-certificates && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Enable PNPM
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

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
COPY community/lending-agent-no-wallet/package.json ./community/lending-agent-no-wallet/

# ------------------------------
# 3. Install deps based on the copied package.json set. Skip lifecycle scripts for now
#    because source files are not yet in the build context (they are copied in step 4).
#    This keeps the layer cache-friendly while avoiding prepare/postinstall failures.
# ------------------------------
RUN pnpm install --frozen-lockfile

# ------------------------------
# 4. Now copy the rest of the source code
# ------------------------------
COPY . .

RUN pnpm --filter lending-agent-no-wallet... build
WORKDIR /app/community/lending-agent-no-wallet/dist

# Expose port for SSE MCP server
EXPOSE 3001

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the Lending agent (path is relative to the WORKDIR set above)
CMD ["node", "index.js"]