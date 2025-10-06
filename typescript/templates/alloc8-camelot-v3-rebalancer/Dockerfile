FROM node:20-slim

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy workspace configuration
COPY typescript/pnpm-workspace.yaml ./
COPY typescript/package.json ./
COPY typescript/pnpm-lock.yaml ./
COPY typescript/tsconfig.base.json ./

# Copy lib dependencies
COPY typescript/lib ./lib

# Copy agent source
COPY typescript/templates/alloc8-camelot-v3-rebalancer ./templates/alloc8-camelot-v3-rebalancer

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build the agent
WORKDIR /app/templates/alloc8-camelot-v3-rebalancer
RUN pnpm build

# Expose port
EXPOSE 3001

# Start the agent
CMD ["pnpm", "start"]
