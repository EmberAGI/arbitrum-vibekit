FROM node:20-slim AS builder

WORKDIR /app

# Install pnpm globally
RUN npm install -g pnpm@10.7.0

# Copy package files
COPY package.json pnpm-lock.yaml* ./
COPY tsconfig.json ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY src/ src/

# Build the application
RUN pnpm run build

# Production stage
FROM node:20-slim AS production

# Create a non-root user
RUN groupadd -r trendmoon && useradd -r -g trendmoon trendmoon

WORKDIR /app

# Install pnpm globally
RUN npm install -g pnpm@10.7.0

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules

# Change ownership to non-root user
RUN chown -R trendmoon:trendmoon /app

# Switch to non-root user
USER trendmoon

# Expose port for HTTP mode
EXPOSE 3000

# Start the server
CMD ["node", "dist/index.js"]
