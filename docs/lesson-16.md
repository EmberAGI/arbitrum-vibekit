---
title: "Production Deployment Strategies"
category: "advanced"
difficulty: "hard"
duration: "23 minutes"
prerequisites: ["lesson-10"]
next_lesson: "lesson-17"
framework_version: "3.0+ (Agent Node)"
last_updated: "2025-10-15"
tags: ["deployment","production","infrastructure"]
---

# **Lesson 16: Observability and Metrics in V2**

---

### 🔍 Overview

The v2 framework provides comprehensive observability features for monitoring agent health, tracking performance metrics, and debugging agent behavior. Understanding these patterns is crucial for running production agents and maintaining reliable service operations.

V2 agents include built-in health endpoints, agent cards for service discovery, and hook-based metrics collection. You can start with lightweight monitoring and scale up to full observability platforms like OpenTelemetry and Grafana.

---

### 🏥 Built-in Health Endpoints

Every v2 agent automatically provides a health endpoint:

```ts
// GET /health - automatically available
{
  "status": "healthy",
  "timestamp": "2025-01-15T10:30:00Z",
  "version": "1.2.0",
  "uptime": 3600,
  "checks": {
    "llmProvider": "ok",
    "mcpServers": "ok",
    "database": "ok"
  },
  "skills": [
    {
      "id": "token-swapping",
      "status": "ready",
      "lastUsed": "2025-01-15T10:25:00Z"
    }
  ]
}
```

### 🆔 Agent Cards for Service Discovery

V2 agents publish agent cards at `/.well-known/agent.json` for automatic discovery:

```json
{
  "name": "Lending Agent",
  "version": "1.0.0",
  "description": "A DeFi lending agent for Aave protocol",
  "skills": [...],
  "endpoints": {
    "mcp": "/mcp",
    "health": "/health"
  }
}
```

---

### 📊 Hook-Based Metrics Collection

Use before/after hooks to collect metrics without cluttering business logic:

```ts
// metrics/hooks.ts
export const metricsCollector = new Map<string, number>();

export const metricsHook: AfterHook<any> = async (result, context, args) => {
  const toolName = context.tool || 'unknown';
  metricsCollector.set(toolName, (metricsCollector.get(toolName) || 0) + 1);

  return result;
};

// Apply to tools
export const instrumentedTool = withHooks(baseTool, {
  after: [metricsHook, formatResponseHook],
});
```

### 🛠 Examples of Useful Metrics

**Performance Tracking:**

- Tool execution time and success rates
- LLM request latency and token usage
- MCP server response times
- Hook execution overhead

**Business Metrics:**

- Skill usage patterns and popular capabilities
- Transaction success rates and error types
- User interaction patterns
- Resource utilization

**Health Indicators:**

- Error rates by tool and skill
- External service availability
- Memory and CPU usage trends
- Rate limiting and throttling events

---

### 🧪 Production Monitoring Integration

#### **Health Monitoring**

Monitor agent health across your infrastructure:

```ts
export class HealthMonitor {
  async checkAllAgents(): Promise<HealthReport[]> {
    const agents = this.registry.getAllAgents();

    const healthChecks = agents.map(async agent => {
      try {
        const response = await fetch(`${agent.url}/health`);
        const health = await response.json();

        return {
          agent: agent.name,
          status: health.status,
          lastCheck: new Date(),
          uptime: health.uptime,
          version: health.version,
        };
      } catch (error) {
        return {
          agent: agent.name,
          status: 'unreachable',
          lastCheck: new Date(),
          error: error.message,
        };
      }
    });

    return Promise.all(healthChecks);
  }
}
```

#### **Metrics Export**

Export metrics for external monitoring systems:

```ts
// monitoring/metrics.ts
export class MetricsCollector {
  private counters = new Map<string, number>();
  private gauges = new Map<string, number>();
  private histograms = new Map<string, number[]>();

  increment(name: string, value: number = 1): void {
    this.counters.set(name, (this.counters.get(name) || 0) + value);
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
          },
        ])
      ),
      timestamp: new Date().toISOString(),
    };
  }
}
```

---

### 🔧 Structured Logging

Implement structured logging for better observability:

```ts
// logging/logger.ts
import winston from 'winston';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: process.env.AGENT_NAME || 'vibekit-agent',
    version: process.env.AGENT_VERSION || '1.0.0',
  },
  transports: [
    new winston.transports.Console({
      format:
        process.env.NODE_ENV === 'development' ? winston.format.simple() : winston.format.json(),
    }),
  ],
});

// Use in hooks
export const loggingHook: BeforeHook<any> = async (args, context) => {
  logger.info('Tool execution started', {
    tool: context.tool,
    args: args,
    skillInput: context.skillInput,
  });

  return args;
};
```

---

### ⚠️ Best Practices

**Do:**

- Use hooks for automatic metrics collection
- Monitor both business and technical metrics
- Include correlation IDs for tracing
- Set up alerting on critical metrics
- Use structured logging in production

**Don't:**

- Log sensitive data (private keys, personal info)
- Block execution for metrics collection
- Hard-code metric names - use constants
- Ignore error rates and latency trends
- Over-instrument - focus on key indicators

---

### ✅ Summary

V2 observability is built around health endpoints, agent cards, and hook-based metrics. The framework provides production-ready monitoring out of the box, with clean patterns for extending to full observability platforms.

Start with built-in health checks and hook-based metrics, then integrate with monitoring systems as your agent ecosystem grows.

> "Observable agents are reliable agents. If you can't measure it, you can't improve it."

| Feature                       | Benefit                            | Use Case                  |
| ----------------------------- | ---------------------------------- | ------------------------- |
| **Built-in health endpoints** | Zero-config monitoring             | Basic health checks       |
| **Agent cards**               | Service discovery and metadata     | Multi-agent orchestration |
| **Hook-based metrics**        | Non-intrusive performance tracking | Tool and skill monitoring |
| **Structured logging**        | Searchable, queryable log data     | Debugging and analysis    |
| **External integration**      | Enterprise monitoring and alerting | Production operations     |
