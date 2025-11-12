---
title: "Security Best Practices"
category: "advanced"
difficulty: "hard"
duration: "23 minutes"
prerequisites: ["lesson-17"]
next_lesson: "lesson-19"
framework_version: "3.0+ (Agent Node)"
last_updated: "2025-10-15"
tags: ["security","best-practices","compliance"]
---

# **Lesson 18: Deployment and Hosting**

---

### 🚀 Overview

Your agent is just a Node.js server that runs MCP and A2A endpoints. That means it can be deployed just like any other lightweight Express app. This lesson explains how to containerize, host, and run your agent with the minimal infrastructure.

---

### 💪 Docker Support

All agents should include a `Dockerfile` that starts from a slim Node image:

```Dockerfile
FROM node:20-slim
WORKDIR /app
COPY . .
RUN npm ci --omit=dev
CMD ["node", "index.js"]
```

Then build and run:

```sh
docker build -t my-agent .
docker run -p 3000:3000 my-agent
```

---

### 🚗 Hosting Options

You can run your agent on any platform that supports containers or Node.js:

- Railway / Render
- Fly.io
- AWS Fargate / Lambda
- Azure Container Apps
- Google Cloud Run

Agents that don’t need persistent storage can scale horizontally with almost no config.

---

### ⚙️ Environment Setup

Use `.env` or similar to inject secrets like:

- API keys for third-party MCP providers
- Wallet signer credentials
- x402 pricing configuration

If you’re using Docker, make sure to `.dockerignore` `node_modules/` and load `.env` separately.

---

### 🚫 What Not to Do

- Don’t hard-code keys or config into code
- Don’t assume one instance will run forever (agents should restart cleanly)
- Don’t bind ports directly if running behind a gateway or proxy

---

### ✅ Summary

Agents deploy like any Node.js server. Use Docker to keep setup portable, and choose a host that matches your workload’s scale and latency needs.

> "If it runs with `node .`, it runs in the cloud."

| Decision                                     | Rationale                                                                                             |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Tiny `Dockerfile` (node:20-slim)**         | Avoids multi-stage complexity; juniors grasp container basics quickly; image stays < 200 MB.          |
| **`.env.example` & `docker run --env-file`** | Encourages secrets management best practices and consistent local/prod configuration.                 |
| **`npm run dev` with nodemon**               | Fast feedback loop without Docker rebuilds; balances container deploy with plain Node dev ergonomics. |
| **ngrok / localtunnel tip**                  | Recognises LLM endpoints often need public URLs during development; gives devs a one-line solution.   |
| **Health-check advice**                      | Prepares agents for orchestrators (K8s, ECS) that expect readiness/liveness endpoints.                |
