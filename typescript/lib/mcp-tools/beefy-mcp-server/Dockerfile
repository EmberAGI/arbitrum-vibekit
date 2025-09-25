# Use the same base image as other services
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY lib/mcp-tools/beefy-mcp-server/package.json ./lib/mcp-tools/beefy-mcp-server/
COPY onchain-actions-plugins/registry/package.json ./onchain-actions-plugins/registry/
COPY lib/a2a-types/package.json ./lib/a2a-types/
COPY lib/a2a-types/tsconfig.json ./lib/a2a-types/
COPY lib/a2a-types/src ./lib/a2a-types/src

# Install pnpm
RUN npm install -g pnpm

# Install dependencies
RUN pnpm install --no-frozen-lockfile

# Copy source code (excluding node_modules to avoid conflicts)
COPY lib/mcp-tools/beefy-mcp-server/src ./lib/mcp-tools/beefy-mcp-server/src
COPY lib/mcp-tools/beefy-mcp-server/tsconfig.json ./lib/mcp-tools/beefy-mcp-server/
COPY onchain-actions-plugins/registry/src ./onchain-actions-plugins/registry/src
COPY onchain-actions-plugins/registry/tsconfig.json ./onchain-actions-plugins/registry/
COPY onchain-actions-plugins/registry/tsup.config.ts ./onchain-actions-plugins/registry/
COPY tsconfig.base.json ./

# Build the project
RUN pnpm build

# Build the beefy MCP server specifically
WORKDIR /app/lib/mcp-tools/beefy-mcp-server
RUN pnpm build

# Expose port
EXPOSE 3012

# Start the server
CMD ["pnpm", "start"]
