# syntax=docker/dockerfile:1.7
FROM node:22

# NOTE: We intentionally avoid `apt-get` here.
# Some environments intermittently fail `apt-get update` (GPG signature / TLS trust issues),
# which makes `docker build --no-cache` unreliable. `node:22` is based on `buildpack-deps`,
# which already includes common build tooling needed for native Node deps.

WORKDIR /app

# Enable PNPM via Corepack (Node 22)
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV PNPM_STORE_DIR="/pnpm/store"
RUN corepack enable && corepack prepare pnpm@10.7.0 --activate

# Standalone install + build.
# This Dockerfile is intended to be built from THIS directory as the Docker build context.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

CMD ["node", "/app/dist/hire.js"]
