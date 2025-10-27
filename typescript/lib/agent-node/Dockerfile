# Build and deploy stage
FROM node:22-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.17.0 --activate

WORKDIR /workspace

# Copy entire workspace
COPY . .

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Build (clean is handled by build script)
RUN pnpm --filter=agent-node build

# Deploy to isolated directory with production dependencies only
RUN pnpm --filter=agent-node --prod deploy /deploy

# Production stage - minimal runtime image
FROM node:22-alpine

WORKDIR /app

# Copy deployed package from builder stage
COPY --from=builder /deploy .

# Expose port
EXPOSE 3000

# Run the application
CMD ["node", "dist/server.js"]