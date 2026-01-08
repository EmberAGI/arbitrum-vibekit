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

# Optional: bake a runtime env file into the image using a BuildKit secret:
#   docker build --secret id=env,src=.env ...
# We always create the file so `node --env-file` does not fail if the secret is omitted.
RUN touch /app/.env.runtime
RUN --mount=type=secret,id=env,required=false,target=/tmp/.env \
    sh -c 'if [ -s /tmp/.env ]; then cp /tmp/.env /app/.env.runtime; else echo "WARN: no build secret env provided; /app/.env.runtime is empty." >&2; fi'

CMD ["node", "--env-file=/app/.env.runtime", "/app/dist/hire.js"]
