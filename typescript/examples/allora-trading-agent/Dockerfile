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

# Install tsx globally for running TypeScript MCP servers
RUN npm install -g tsx

# ------------------------------
# 1. Copy lockfile & workspace config that affect dependency graph cache
# ------------------------------
COPY pnpm-lock.yaml* pnpm-workspace.yaml .npmrc ./
COPY package.json ./
COPY tsconfig.base.json ./

# ------------------------------
# 2. Copy all workspace package.json files
# ------------------------------
COPY lib/ lib/
COPY examples/allora-trading-agent/package.json ./examples/allora-trading-agent/
COPY templates/allora-price-prediction-agent/package.json ./templates/allora-price-prediction-agent/

# ------------------------------
# 3. Install deps based on the copied package.json set.
# ------------------------------
RUN pnpm install --frozen-lockfile

# ------------------------------
# 4. Now copy the rest of the source code
# ------------------------------
COPY . .

# ------------------------------
# 5. Build the agent and its dependencies
# ------------------------------
RUN pnpm --filter @agent/allora-trading-agent... build
WORKDIR /app/examples/allora-trading-agent/dist

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the Allora Trading agent
CMD ["node", "index.js"]