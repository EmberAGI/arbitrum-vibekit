FROM public.ecr.aws/docker/library/node:20-slim

WORKDIR /app

# Install pnpm globally
RUN npm install -g pnpm@10.7.0

# Copy workspace files for pnpm catalog support
COPY pnpm-workspace.yaml ./
COPY .npmrc ./
COPY pnpm-lock.yaml* ./
COPY tsconfig.base.json ./
COPY package.json ./

# Copy package manifests for the target package and its workspace deps
COPY lib/arbitrum-vibekit-core/package.json ./lib/arbitrum-vibekit-core/
COPY lib/mcp-tools/para-mcp-server/package.json ./lib/mcp-tools/para-mcp-server/
COPY lib/mcp-tools/para-mcp-server/.npmrc ./lib/mcp-tools/para-mcp-server/
# Workspace dependencies required by arbitrum-vibekit-core
COPY lib/ember-schemas/package.json ./lib/ember-schemas/
COPY lib/a2a-types/package.json ./lib/a2a-types/
# Include ember-api manifest as it may be used by other workspace packages
COPY lib/ember-api/package.json ./lib/ember-api/

# Install dependencies for para-mcp-server (and its transitive workspace deps) without running prepare scripts
RUN pnpm install --filter=@arbitrum-vibekit/para-mcp-server... --frozen-lockfile --ignore-scripts

# Copy source code for the server and its local deps, then build
COPY lib/arbitrum-vibekit-core/ ./lib/arbitrum-vibekit-core/
COPY lib/ember-schemas/ ./lib/ember-schemas/
COPY lib/a2a-types/ ./lib/a2a-types/
COPY lib/ember-api/ ./lib/ember-api/
COPY lib/mcp-tools/para-mcp-server/ ./lib/mcp-tools/para-mcp-server/

# Build workspace dependencies so runtime imports resolve
WORKDIR /app
RUN pnpm --filter ember-schemas build \
  && pnpm --filter @google-a2a/types build \
  && pnpm --filter arbitrum-vibekit-core build

# Build the Para MCP server
WORKDIR /app/lib/mcp-tools/para-mcp-server
RUN pnpm build

EXPOSE 3012

CMD ["node", "dist/index.js"]