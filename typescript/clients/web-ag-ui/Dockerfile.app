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

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
COPY apps ./apps

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile

ARG APP_NAME
ENV APP_NAME="${APP_NAME}"
ARG APP_ENV_FILE
RUN if [ -z "${APP_ENV_FILE}" ]; then APP_ENV_FILE="apps/${APP_NAME}/.env"; fi; \
    if [ -f "${APP_ENV_FILE}" ]; then \
      if [ "${APP_NAME}" = "web" ]; then \
        cp "${APP_ENV_FILE}" "/app/apps/${APP_NAME}/.env.local"; \
      elif [ "${APP_ENV_FILE}" != "apps/${APP_NAME}/.env" ]; then \
        cp "${APP_ENV_FILE}" "/app/apps/${APP_NAME}/.env"; \
      fi; \
    fi
RUN pnpm --filter "${APP_NAME}" build

CMD ["sh", "-lc", "pnpm --filter \"$APP_NAME\" start"]
