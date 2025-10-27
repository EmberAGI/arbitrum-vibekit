---
title: "Production Deployment and Configuration"
category: "advanced"
difficulty: "hard"
duration: "23 minutes"
prerequisites: ["lesson-24"]
next_lesson: "lesson-26"
framework_version: "3.0+ (Agent Node)"
last_updated: "2025-10-15"
tags: ["deployment","configuration","production"]
---

# **Lesson 25: Production Deployment and Configuration**

---

### 🔍 Overview

Deploying agents to production requires careful consideration of configuration management, service discovery, monitoring, and security. The v2 framework provides built-in features for production deployment, including agent cards, health endpoints, and flexible configuration patterns.

Understanding production deployment patterns, environment management, and operational concerns is crucial for running reliable agents that can be discovered and integrated by other systems.

This lesson covers production-ready deployment practices, monitoring, and the operational aspects of running v2 agents.

---

### 🌐 Agent Cards and Service Discovery

Every v2 agent automatically exposes an agent card at `/.well-known/agent.json` that describes its capabilities:

```json
{
  "name": "Lending Agent",
  "version": "1.0.0",
  "description": "A DeFi lending agent for Aave protocol",
  "url": "https://api.myagent.com",
  "capabilities": {
    "streaming": false,
    "pushNotifications": false,
    "stateTransitionHistory": false
  },
  "skills": [
    {
      "id": "lending-operations",
      "name": "Lending Operations",
      "description": "Perform lending operations on Aave protocol",
      "tags": ["defi", "lending", "aave"],
      "examples": ["Supply 100 USDC", "Borrow 50 ETH"]
    }
  ],
  "endpoints": {
    "mcp": "/sse",
    "health": "/health"
  }
}
```

#### **Service Discovery Integration**

Use agent cards for automatic service discovery:

```ts
// discovery/agentRegistry.ts
export class AgentRegistry {
  private agents = new Map<string, AgentCard>();

  async registerAgent(url: string): Promise<void> {
    try {
      const response = await fetch(`${url}/.well-known/agent.json`);
      const agentCard: AgentCard = await response.json();

      this.agents.set(agentCard.name, {
        ...agentCard,
        url,
        lastSeen: new Date(),
        status: 'active',
      });

      console.log(`Registered agent: ${agentCard.name} at ${url}`);
    } catch (error) {
      console.error(`Failed to register agent at ${url}:`, error.message);
    }
  }

  async discoverAgents(urls: string[]): Promise<AgentCard[]> {
    const discoveries = urls.map(url => this.registerAgent(url));
    await Promise.allSettled(discoveries);
    return Array.from(this.agents.values());
  }

  findAgentsByCapability(capability: string): AgentCard[] {
    return Array.from(this.agents.values()).filter(agent =>
      agent.skills.some(
        skill =>
          skill.tags.includes(capability) ||
          skill.description.toLowerCase().includes(capability.toLowerCase())
      )
    );
  }
}
```

---

### 🔧 Environment Configuration

#### **Environment Variable Patterns**

Organize environment variables by category:

```bash
# .env.production
# ================
# LLM Provider Configuration
OPENROUTER_API_KEY=sk-or-v1-...
LLM_MODEL=google/gemini-2.5-flash-preview

# Agent Identity
AGENT_NAME=Production Lending Agent
AGENT_VERSION=1.2.3
AGENT_DESCRIPTION=Production-ready DeFi lending agent for Arbitrum
AGENT_URL=https://lending-agent.mycompany.com

# Server Configuration
PORT=3000
ENABLE_CORS=true
BASE_PATH=/api/v1

# Feature Flags
ENABLE_STREAMING=false
ENABLE_NOTIFICATIONS=true
ENABLE_HISTORY=true
ENABLE_ANALYTICS=true

# External Service Dependencies
EMBER_ENDPOINT=@https://api.emberai.xyz/mcp
QUICKNODE_API_KEY=qn_...
ALCHEMY_API_KEY=alch_...

# Security
JWT_SECRET=your-secure-jwt-secret
API_RATE_LIMIT=100
MAX_REQUEST_SIZE=10mb

# Monitoring & Logging
LOG_LEVEL=info
METRICS_ENABLED=true
HEALTH_CHECK_INTERVAL=30000

# Database (if needed)
DATABASE_URL=postgresql://user:pass@host:port/db
REDIS_URL=redis://host:port
```

#### **Configuration Validation**

Validate configuration at startup:

```ts
// config/validation.ts
import { z } from 'zod';

const configSchema = z.object({
  // Required configuration
  OPENROUTER_API_KEY: z.string().min(10),
  PORT: z
    .string()
    .transform(val => parseInt(val, 10))
    .refine(val => val > 0 && val < 65536),

  // Optional with defaults
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  ENABLE_CORS: z
    .string()
    .transform(val => val === 'true')
    .default('true'),

  // Service dependencies
  EMBER_ENDPOINT: z.string().optional(),
  QUICKNODE_API_KEY: z.string().optional(),
});

export function validateConfig(): z.infer<typeof configSchema> {
  try {
    return configSchema.parse(process.env);
  } catch (error) {
    console.error('Configuration validation failed:');
    if (error instanceof z.ZodError) {
      error.errors.forEach(err => {
        console.error(`  ${err.path.join('.')}: ${err.message}`);
      });
    }
    process.exit(1);
  }
}

// Use in index.ts
const config = validateConfig();
```

#### **Multi-Environment Setup**

Organize configuration files by environment:

```
config/
├── .env.development     # Local development
├── .env.staging        # Staging environment
├── .env.production     # Production environment
└── .env.test          # Testing environment
```

```ts
// config/loader.ts
import 'dotenv/config';
import path from 'path';

export function loadEnvironmentConfig(): void {
  const env = process.env.NODE_ENV || 'development';
  const configPath = path.join(process.cwd(), `config/.env.${env}`);

  try {
    require('dotenv').config({ path: configPath });
    console.log(`Loaded configuration for ${env} environment`);
  } catch (error) {
    console.warn(`No config file found at ${configPath}, using defaults`);
  }
}
```

---

### 🐳 Containerization and Deployment

#### **Production Dockerfile**

```dockerfile
# Dockerfile.prod
FROM node:20-alpine AS builder

# Install dependencies
WORKDIR /app
COPY package*.json ./
COPY pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile

# Build application
COPY . .
RUN pnpm build

# Production stage
FROM node:20-alpine AS production

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S agent -u 1001 -G nodejs

# Install production dependencies only
WORKDIR /app
COPY package*.json ./
COPY pnpm-lock.yaml ./
RUN npm install -g pnpm && \
    pnpm install --frozen-lockfile --prod && \
    pnpm store prune

# Copy built application
COPY --from=builder --chown=agent:nodejs /app/dist ./dist
COPY --from=builder --chown=agent:nodejs /app/package.json ./

# Security: run as non-root user
USER agent

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:${PORT:-3000}/health || exit 1

# Expose port
EXPOSE 3000

# Start application
CMD ["node", "dist/index.js"]
```

#### **Docker Compose for Production**

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  lending-agent:
    build:
      context: .
      dockerfile: Dockerfile.prod
    ports:
      - '3000:3000'
    environment:
      - NODE_ENV=production
      - PORT=3000
    env_file:
      - config/.env.production
    restart: unless-stopped
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:3000/health']
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    logging:
      driver: 'json-file'
      options:
        max-size: '10m'
        max-file: '3'
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '0.5'
        reservations:
          memory: 256M
          cpus: '0.25'

  # Optional: Redis for caching
  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: redis-server --appendonly yes
    volumes:
      - redis-data:/data
    ports:
      - '6379:6379'

volumes:
  redis-data:
```

---

### 📊 Health Checks and Monitoring

#### **Built-in Health Endpoint**

Every v2 agent includes a health endpoint:

```ts
// The framework automatically provides /health endpoint
// You can enhance it with custom health checks

// src/health.ts (optional custom health checks)
export async function customHealthChecks(): Promise<HealthStatus> {
  const checks = await Promise.allSettled([
    checkDatabaseConnection(),
    checkExternalAPIs(),
    checkLLMProvider(),
    checkMCPServers(),
  ]);

  const failed = checks.filter(check => check.status === 'rejected');

  return {
    status: failed.length === 0 ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    checks: {
      database: checks[0].status === 'fulfilled' ? 'ok' : 'error',
      externalAPIs: checks[1].status === 'fulfilled' ? 'ok' : 'error',
      llmProvider: checks[2].status === 'fulfilled' ? 'ok' : 'error',
      mcpServers: checks[3].status === 'fulfilled' ? 'ok' : 'error',
    },
    version: process.env.AGENT_VERSION || '1.0.0',
    uptime: process.uptime(),
  };
}
```

#### **Application Metrics**

Collect and expose metrics:

```ts
// monitoring/metrics.ts
export class MetricsCollector {
  private counters = new Map<string, number>();
  private gauges = new Map<string, number>();
  private histograms = new Map<string, number[]>();

  increment(name: string, value: number = 1): void {
    this.counters.set(name, (this.counters.get(name) || 0) + value);
  }

  gauge(name: string, value: number): void {
    this.gauges.set(name, value);
  }

  histogram(name: string, value: number): void {
    if (!this.histograms.has(name)) {
      this.histograms.set(name, []);
    }
    this.histograms.get(name)!.push(value);
  }

  getMetrics(): Record<string, any> {
    return {
      counters: Object.fromEntries(this.counters),
      gauges: Object.fromEntries(this.gauges),
      histograms: Object.fromEntries(
        Array.from(this.histograms.entries()).map(([name, values]) => [
          name,
          {
            count: values.length,
            sum: values.reduce((a, b) => a + b, 0),
            avg: values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0,
            min: Math.min(...values),
            max: Math.max(...values),
          },
        ])
      ),
      timestamp: new Date().toISOString(),
    };
  }
}

// Use in hooks for automatic metrics collection
export const metricsCollector = new MetricsCollector();
```

#### **Structured Logging**

Implement structured logging:

```ts
// logging/logger.ts
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: 'lending-agent',
    version: process.env.AGENT_VERSION || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
  },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
    }),
    // In production, add file or cloud logging
    ...(process.env.NODE_ENV === 'production'
      ? [
          new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
          new winston.transports.File({ filename: 'logs/combined.log' }),
        ]
      : []),
  ],
});

export { logger };

// Use in application
logger.info('Agent starting', { port: 3000, skills: ['lending'] });
logger.error('Tool execution failed', { tool: 'supplyToken', error: error.message });
```

---

### 🔒 Security and Rate Limiting

#### **Rate Limiting**

Implement rate limiting for API protection:

```ts
// security/rateLimiting.ts
import rateLimit from 'express-rate-limit';

export const createRateLimit = () =>
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.API_RATE_LIMIT || '100'), // requests per window
    message: {
      error: 'Too many requests',
      message: 'Rate limit exceeded. Please try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: req => {
      // Skip rate limiting for health checks
      return req.path === '/health' || req.path === '/.well-known/agent.json';
    },
  });
```

#### **Request Validation**

Validate incoming requests:

```ts
// security/validation.ts
import { body, validationResult } from 'express-validator';

export const validateToolCall = [
  body('tool').isString().isLength({ min: 1, max: 100 }),
  body('arguments').isObject(),
  body('arguments.walletAddress')
    .optional()
    .isEthereumAddress()
    .withMessage('Invalid Ethereum address'),
  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array(),
      });
    }
    next();
  },
];
```

---

### 🚀 Deployment Strategies

#### **Blue-Green Deployment**

```bash
#!/bin/bash
# deploy.sh - Blue-green deployment script

set -e

NEW_VERSION=$1
CURRENT_PORT=$(cat .current-port 2>/dev/null || echo "3000")
NEW_PORT=$((CURRENT_PORT == 3000 ? 3001 : 3000))

echo "Deploying version $NEW_VERSION to port $NEW_PORT"

# Build and start new version
docker build -t lending-agent:$NEW_VERSION .
docker run -d \
  --name lending-agent-$NEW_PORT \
  -p $NEW_PORT:3000 \
  --env-file config/.env.production \
  lending-agent:$NEW_VERSION

# Health check new version
echo "Waiting for new version to be healthy..."
for i in {1..30}; do
  if curl -f http://localhost:$NEW_PORT/health; then
    echo "New version is healthy"
    break
  fi
  sleep 2
done

# Update load balancer to point to new version
echo "Switching traffic to new version..."
# Update nginx/load balancer configuration here

# Stop old version
if [ "$CURRENT_PORT" != "3000" ] || [ "$CURRENT_PORT" != "3001" ]; then
  echo "Stopping old version on port $CURRENT_PORT"
  docker stop lending-agent-$CURRENT_PORT || true
  docker rm lending-agent-$CURRENT_PORT || true
fi

echo $NEW_PORT > .current-port
echo "Deployment complete"
```

#### **Kubernetes Deployment**

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: lending-agent
  labels:
    app: lending-agent
spec:
  replicas: 3
  selector:
    matchLabels:
      app: lending-agent
  template:
    metadata:
      labels:
        app: lending-agent
    spec:
      containers:
        - name: lending-agent
          image: lending-agent:latest
          ports:
            - containerPort: 3000
          env:
            - name: NODE_ENV
              value: 'production'
            - name: PORT
              value: '3000'
          envFrom:
            - secretRef:
                name: lending-agent-secrets
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 30
          readinessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 10
          resources:
            requests:
              memory: '256Mi'
              cpu: '250m'
            limits:
              memory: '512Mi'
              cpu: '500m'

---
apiVersion: v1
kind: Service
metadata:
  name: lending-agent-service
spec:
  selector:
    app: lending-agent
  ports:
    - protocol: TCP
      port: 80
      targetPort: 3000
  type: LoadBalancer
```

---

### ✅ Summary

Production deployment of v2 agents requires attention to:

- **Agent cards** provide automatic service discovery and capability advertising
- **Environment configuration** should be validated and organized by deployment stage
- **Containerization** enables consistent deployment across environments
- **Health checks** and monitoring ensure operational visibility
- **Security measures** protect against abuse and validate inputs
- **Deployment strategies** enable zero-downtime updates
- **Logging and metrics** provide operational insights

Plan for production from the start: use environment variables, implement health checks, and design for observability and scalability.

> "Production readiness is not a destination, it's a practice."

| Aspect            | Development        | Production                       |
| ----------------- | ------------------ | -------------------------------- |
| **Configuration** | .env files         | Validated env vars + secrets     |
| **Logging**       | Console output     | Structured logs + aggregation    |
| **Monitoring**    | Basic health check | Metrics + alerting + dashboards  |
| **Security**      | Basic validation   | Rate limiting + input validation |
| **Deployment**    | Manual start       | Automated CI/CD + health checks  |
| **Scaling**       | Single instance    | Load balanced + auto-scaling     |
