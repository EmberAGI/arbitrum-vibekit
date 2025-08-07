FROM node:20-slim

WORKDIR /app

# Install pnpm globally
RUN npm install -g pnpm@10.7.0

# Copy workspace files for pnpm catalog support
COPY pnpm-workspace.yaml ./
COPY .npmrc ./
COPY pnpm-lock.yaml* ./
COPY tsconfig.base.json ./

# Copy the specific package files
COPY lib/mcp-tools/coingecko-mcp-server/package.json ./lib/mcp-tools/coingecko-mcp-server/
COPY lib/mcp-tools/coingecko-mcp-server/.npmrc ./lib/mcp-tools/coingecko-mcp-server/

# Install dependencies without running prepare scripts
RUN pnpm install --filter=@arbitrum-vibekit/coingecko-mcp-server --frozen-lockfile --ignore-scripts

# Copy source code and build
COPY lib/mcp-tools/coingecko-mcp-server/src/ ./lib/mcp-tools/coingecko-mcp-server/src/
COPY lib/mcp-tools/coingecko-mcp-server/tsconfig.json ./lib/mcp-tools/coingecko-mcp-server/
WORKDIR /app/lib/mcp-tools/coingecko-mcp-server
RUN pnpm build

EXPOSE 3011

CMD ["node", "dist/http-server.js"] 