FROM node:18-alpine

# Install pnpm
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy workspace files
COPY typescript/package.json typescript/pnpm-workspace.yaml ./
COPY typescript/pnpm-lock.yaml ./
COPY typescript/tsconfig.base.json ./

# Copy ember-agent specific files
COPY typescript/templates/ember-agent/package.json ./templates/ember-agent/
COPY typescript/templates/ember-agent/tsconfig.json ./templates/ember-agent/

# Copy required workspace packages
COPY typescript/lib/ ./lib/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy agent source code
COPY typescript/templates/ember-agent/src/ ./templates/ember-agent/src/

# Build the project
RUN pnpm build

# Set working directory to ember-agent
WORKDIR /app/templates/ember-agent

# Expose port
EXPOSE 3001

# Start the agent
CMD ["pnpm", "start"] 