
# Etapa 1: dependencias
FROM node:20-alpine AS deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package*.json ./
RUN npm ci


# Etapa 2: build
FROM node:20-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Etapa 3: runtime
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS="--dns-result-order=ipv4first"

RUN apk add --no-cache libc6-compat ca-certificates curl

# Copia deps y purga dev
COPY --from=deps /app/node_modules ./node_modules
RUN npm prune --omit=dev

# Copia artefactos de build
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json

# Usuario no-root
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs \
 && chown -R nextjs:nodejs /app
USER nextjs

EXPOSE 8080
# Start Next.js directly without npm wrapper
CMD ["node_modules/.bin/next", "start", "-p", "8080", "-H", "0.0.0.0"]