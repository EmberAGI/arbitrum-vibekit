FROM node:23-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y python3 make g++ \
    && apt-get clean

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
ENV NEXT_TELEMETRY_DISABLED=1

COPY . .

RUN pnpm install
RUN pnpm build

FROM node:23-slim AS runner

WORKDIR /app

RUN apt-get update && apt-get install -y python3 make g++ \
    && apt-get clean

ENV NODE_ENV=development

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/lib ./lib

RUN pnpm install

EXPOSE 3000

CMD ["sh", "-c", "pnpm db:migrate && pnpm start"]