# Build stage - Context should be the typescript/ directory
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
RUN apk add --no-cache git && \
    npm install -g pnpm@10.7.0

# Copy everything
# The build context is the entire typescript/ directory to support pnpm workspaces
COPY . .

# Configure git to use HTTPS instead of SSH for GitHub - comprehensive approach
RUN git config --global url."https://github.com/".insteadOf "git@github.com:" && \
    git config --global url."https://github.com/".insteadOf "ssh://git@github.com/" && \
    git config --global url."https://github.com/".insteadOf "git+ssh://git@github.com/" && \
    git config --global url."https://github.com/".insteadOf "https://git@github.com:" && \
    git config --global url."https://github.com/".insteadOf "git+https://git@github.com:" && \
    git config --global --add url."https://github.com/google-a2a/A2A.git".insteadOf "git@github.com:google-a2a/A2A.git"

# Install all dependencies
# This creates symlinks between workspace packages as pnpm normally does
RUN pnpm install --frozen-lockfile

# Build only the necessary workspace packages
# The "..." suffix tells pnpm to build hyperliquid-vault-agent and all its dependencies
RUN pnpm --filter hyperliquid-vault-agent... build

# Deploy the specific package with its dependencies
# pnpm deploy creates a production-ready bundle without symlinks, perfect for Docker
RUN pnpm config set force-legacy-deploy true && \
    pnpm --filter=hyperliquid-vault-agent deploy --prod deploy-output

# Production stage
FROM node:20-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init && \
    addgroup -g 1001 -S ember && \
    adduser -S ember -u 1001

# Copy the deployed application
# The deploy-output directory contains a self-contained application with all dependencies
COPY --from=builder /app/deploy-output /app

WORKDIR /app

# Change ownership to non-root user
RUN chown -R ember:ember /app

# Switch to non-root user
USER ember

# Expose port for SSE MCP server
EXPOSE 3012

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the Hyperliquid Vault agent
CMD ["node", "dist/index.js"] 