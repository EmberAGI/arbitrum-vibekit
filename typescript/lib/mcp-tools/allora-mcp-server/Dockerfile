FROM node:20-slim

WORKDIR /app

# Install pnpm globally
RUN npm install -g pnpm@10.7.0

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile
COPY src/ ./src/
COPY tsconfig.json ./
RUN pnpm run build

EXPOSE 3001

CMD ["node", "dist/index.js"]
