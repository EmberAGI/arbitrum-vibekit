FROM node:23

WORKDIR /app

# RUN apt-get update && apt-get install -y python3 make g++ \
#     && apt-get clean

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
ENV NEXT_TELEMETRY_DISABLED=1

COPY . .

RUN pnpm install

CMD ["sh", "-c", "pnpm dev"]