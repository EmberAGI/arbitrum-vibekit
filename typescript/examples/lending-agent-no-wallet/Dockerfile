# Build stage - Context should be the typescript/ directory
FROM node:20

WORKDIR /app

# Install pnpm globally
RUN npm install -g pnpm@10.7.0 typescript@5.8.3


COPY . .

RUN pnpm install --prefer-frozen-lockfile


RUN pnpm --filter lending-agent-no-wallet... build

RUN apt-get update && apt-get install -y --no-install-recommends dumb-init && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app/examples/lending-agent-no-wallet/dist

# Expose port for SSE MCP server
EXPOSE 3001

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the Lending agent (path is relative to the WORKDIR set above)
CMD ["node", "index.js"] 