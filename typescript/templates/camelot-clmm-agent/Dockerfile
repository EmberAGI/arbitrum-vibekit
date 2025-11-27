# Build Camelot CLMM agent with published @emberai/agent-node and packaged workflows

###########
# Builder #
###########
FROM node:22-alpine AS builder

ENV PNPM_HOME="/pnpm"
ENV PNPM_STORE_PATH="/pnpm/store"
ENV PATH="$PNPM_HOME:$PATH"

# Enable pnpm via corepack
RUN corepack enable && corepack prepare pnpm@10.17.0 --activate

WORKDIR /workspace

# Install workflow dependencies using the lockfile for repeatable builds
COPY config/workflows/clmm/package.json config/workflows/clmm/pnpm-lock.yaml ./config/workflows/clmm/
WORKDIR /workspace/config/workflows/clmm
RUN pnpm install --frozen-lockfile

# Copy the full config workspace (env files are excluded by .dockerignore)
WORKDIR /workspace
COPY config ./config

# Build workflow artifacts and drop dev dependencies
WORKDIR /workspace/config/workflows/clmm
RUN pnpm build && pnpm prune --prod

# Install the published agent node CLI globally for runtime use
WORKDIR /workspace
RUN pnpm add -g @emberai/agent-node@1.2.0

##########
# Runner #
##########
FROM node:22-alpine

ENV PNPM_HOME="/pnpm"
ENV PNPM_STORE_PATH="/pnpm/store"
ENV PATH="$PNPM_HOME:$PATH"
ENV NODE_ENV=production

# Enable pnpm via corepack
RUN corepack enable && corepack prepare pnpm@10.17.0 --activate

WORKDIR /app

# Reuse the global agent CLI and pnpm store from the builder
COPY --from=builder /pnpm /pnpm

# Copy the prepared config workspace (includes workflow dist + runtime deps)
COPY --from=builder /workspace/config /app/config

EXPOSE 3000

# Run the agent with the baked config; workflow deps are preinstalled
CMD ["agent", "run", "--config-dir", "/app/config", "--no-install"]
