FROM node:22-alpine

WORKDIR /app

COPY package.json pnpm-lock.yaml* ./
RUN corepack enable && pnpm install --frozen-lockfile 2>/dev/null || pnpm install

COPY . .

ENV NODE_ENV=production
ENV DRY_RUN=true

CMD ["npx", "tsx", "src/index.ts"]
