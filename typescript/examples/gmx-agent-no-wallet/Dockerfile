FROM node:18-alpine

WORKDIR /app

# Copy package.json files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY lib/a2a/package.json ./lib/a2a/package.json
COPY examples/gmx-agent-no-wallet/package.json ./examples/gmx-agent-no-wallet/package.json

# Install dependencies
RUN npm install -g pnpm@latest
RUN pnpm install

# Copy source files
COPY tsconfig.base.json tsconfig.json ./
COPY lib/a2a ./lib/a2a
COPY examples/gmx-agent-no-wallet ./examples/gmx-agent-no-wallet

# Build the application
RUN pnpm --filter gmx-agent-no-wallet build

# Expose the port
EXPOSE 3001

# Start the application
CMD ["node", "examples/gmx-agent-no-wallet/dist/index.js"] 