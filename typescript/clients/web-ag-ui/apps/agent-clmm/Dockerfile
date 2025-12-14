# syntax=docker/dockerfile:1.7
FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends dumb-init ca-certificates python3 make g++ && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

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

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "/app/dist/hire.js"]
