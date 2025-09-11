FROM node:20-alpine

# Install Chrome dependencies and Chromium
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Tell Puppeteer to use the installed Chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Set working directory
WORKDIR /app

# Copy workspace files
COPY pnpm-workspace.yaml ./
COPY pnpm-lock.yaml ./
COPY tsconfig.base.json ./
COPY package.json ./

# Copy lib packages
COPY lib ./lib

# Copy agent files
COPY templates/defisafety-agent ./templates/defisafety-agent

# Install dependencies
RUN pnpm install --no-frozen-lockfile

# Build the workspace
RUN pnpm -r build

# Set working directory to agent
WORKDIR /app/templates/defisafety-agent

# Expose port
EXPOSE 3010

# Start the agent
CMD ["pnpm", "start"]