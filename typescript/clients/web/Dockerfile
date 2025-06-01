FROM node:23-alpine

WORKDIR /app
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json pnpm-lock.yaml ./
RUN pnpm i --frozen-lockfile
COPY . .
EXPOSE 3000
ENTRYPOINT ["pnpm", "dev"]