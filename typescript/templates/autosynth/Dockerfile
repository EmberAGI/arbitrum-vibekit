# Development Dockerfile for AutoSynth Agent
FROM node:20-alpine

# Install pnpm globally
RUN npm install -g pnpm

# Improve network resilience for installs
RUN pnpm config set registry https://registry.npmjs.org/ \
 	&& pnpm config set fetch-retries 5 \
 	&& pnpm config set fetch-retry-factor 2 \
 	&& pnpm config set fetch-retry-maxtimeout 120000 \
 	&& pnpm config set fetch-timeout 120000

# Set working directory
WORKDIR /workspace

# Copy workspace root files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY tsconfig.base.json ./

# Copy necessary lib dependencies
COPY lib ./lib

# Copy the AutoSynth agent
COPY templates/autosynth ./templates/autosynth

# Install all workspace dependencies (with another attempt on transient failures)
RUN pnpm install --no-frozen-lockfile || pnpm install --no-frozen-lockfile

# Build the agent
RUN cd templates/autosynth && pnpm build

# Change to the agent directory
WORKDIR /workspace/templates/autosynth

# Expose port
EXPOSE 3008

# Set environment variables
ENV NODE_ENV=development
ENV PORT=3008

# Start the application
CMD ["pnpm", "start"]