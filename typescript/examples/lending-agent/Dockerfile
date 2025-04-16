# Build stage
FROM node:20-slim AS builder

# Set working directory
WORKDIR /app

# Install pnpm globally
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install all dependencies (including dev dependencies)
RUN pnpm install

# Copy source code
COPY src/ ./src/
COPY tsconfig.json ./

# Build TypeScript code
RUN pnpm exec tsc

# --- Add steps for emberai-mcp ---
# Create the mcp-tools directory
RUN mkdir -p /app/mcp-tools/emberai-mcp

# Copy emberai-mcp from the host into the builder stage
# Note: This requires copying emberai-mcp into the lending-agent directory before building
COPY ./mcp-tools/emberai-mcp /app/mcp-tools/emberai-mcp

# Install dependencies for emberai-mcp
WORKDIR /app/mcp-tools/emberai-mcp
RUN pnpm install

# Build emberai-mcp
RUN pnpm exec tsc

# Return to the main app directory
WORKDIR /app
# --- End steps for emberai-mcp ---

# Production stage
FROM node:20-slim AS production

# Create a non-root user
RUN apt-get update && apt-get install -y --no-install-recommends dumb-init && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* && \
    groupadd -r ember && useradd -r -g ember ember

# Set working directory
WORKDIR /app

# Install pnpm globally
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install only production dependencies
RUN pnpm install --prod

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist

# --- Install and setup emberai-mcp in production stage ---
# Create the directory structure first
RUN mkdir -p ./mcp-tools/emberai-mcp

# Copy package files and built code for emberai-mcp
COPY --from=builder /app/mcp-tools/emberai-mcp/dist ./mcp-tools/emberai-mcp/dist
COPY --from=builder /app/mcp-tools/emberai-mcp/package.json ./mcp-tools/emberai-mcp/package.json
# If pnpm-lock exists, copy it too for deterministic installs
COPY --from=builder /app/mcp-tools/emberai-mcp/pnpm-lock.yaml* ./mcp-tools/emberai-mcp/

# Install dependencies for emberai-mcp within the production stage
WORKDIR /app/mcp-tools/emberai-mcp
# Install *all* dependencies needed by emberai-mcp at runtime
RUN pnpm install --frozen-lockfile
WORKDIR /app
# --- End install steps for emberai-mcp ---

# Copy .env file if it exists (for local development)
COPY .env* ./

# Change ownership to non-root user
RUN chown -R ember:ember /app

# Switch to non-root user
USER ember

# Expose port for SSE MCP server
EXPOSE 3001

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the Lending agent
CMD ["node", "dist/index.js"]