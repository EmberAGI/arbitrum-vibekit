FROM node:22-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --ignore-scripts --production

COPY src/ ./src/
COPY tsconfig.json ./
RUN npm run build 2>/dev/null || ./node_modules/.bin/tsc

FROM node:22-alpine

WORKDIR /app
COPY --from=0 /app/dist ./dist
COPY --from=0 /app/node_modules ./node_modules
COPY .env.example .env

ENV PORT=3000
ENV TRANSPORT_MODE=http
ENV SWORN_RELAY_URL=https://sworn-pact-relay.chitacloud.dev

EXPOSE 3000

CMD ["node", "dist/index.js"]