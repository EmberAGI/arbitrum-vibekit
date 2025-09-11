FROM node:23-alpine

WORKDIR /app

# Install dependencies for node-gyp support for installing bufferutil
RUN apk add --no-cache python3 make g++

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
ENV NEXT_TELEMETRY_DISABLED=1
# Harden pnpm network behavior to reduce ETIMEDOUT failures
ENV PNPM_FETCH_RETRIES=5 \
    PNPM_FETCH_RETRY_FACTOR=2 \
    PNPM_FETCH_RETRY_MINTIMEOUT=20000 \
    PNPM_FETCH_RETRY_MAXTIMEOUT=120000 \
    PNPM_NETWORK_CONCURRENCY=8
COPY package.json pnpm-lock.yaml ./
# Use prefer-frozen-lockfile for dev image to allow lockfile updates when needed
RUN pnpm i --prefer-frozen-lockfile
COPY . .
EXPOSE 3040
ENTRYPOINT ["pnpm", "dev"]