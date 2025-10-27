---
title: "Advanced Agent Architectures"
category: "advanced"
difficulty: "hard"
duration: "23 minutes"
prerequisites: ["lesson-25"]
next_lesson: "lesson-27"
framework_version: "3.0+ (Agent Node)"
last_updated: "2025-10-15"
tags: ["architecture","advanced","patterns"]
---

# **Lesson 26: Modern Transport and Service Discovery**

---

### 🔍 Overview

The v2 framework introduces a modern transport architecture that provides better performance, reliability, and service discovery capabilities. Understanding the transport layer, agent cards, and service discovery patterns is crucial for building production-ready agents that can be easily integrated and monitored.

This lesson covers the StreamableHTTP transport, backwards compatibility with SSE, agent cards for service discovery, and integration patterns with external systems.

---

### 🚀 Modern Transport Architecture

#### **StreamableHTTP Transport (Default)**

The v2 framework uses StreamableHTTP as the primary MCP transport, providing significant improvements over legacy SSE:

```ts
// Automatically configured with modern transport
const agent = Agent.create(agentConfig, {
  llm: { model: providers.openrouter('x-ai/grok-3-mini') },
});

// Exposes modern MCP endpoint at /mcp
await agent.start(3000);
console.log('Modern MCP available at: http://localhost:3000/mcp');
```

#### **StreamableHTTP Benefits**

- **Better Performance**: Optimized request/response cycles
- **Bidirectional Communication**: Full duplex communication
- **Built-in Backpressure**: Automatic flow control
- **Error Recovery**: Robust retry mechanisms
- **Standard Compliance**: Latest MCP SDK implementation

#### **Legacy SSE Support**

For backwards compatibility with older MCP clients:

```ts
const runtimeOptions = {
  // Enable legacy transport alongside modern
  enableLegacySseTransport: true,
  llm: { model: selectedModel },
};

const agent = Agent.create(agentConfig, runtimeOptions);
await agent.start(3000);

// Now provides both endpoints:
// Modern:  http://localhost:3000/mcp  (StreamableHTTP)
// Legacy:  http://localhost:3000/sse  (Server-Sent Events)
```

---

### 🆔 Agent Cards & Service Discovery

Every v2 agent automatically publishes an agent card for service discovery:

#### **Agent Card Structure**

```json
// GET /.well-known/agent.json
{
  "name": "Multi-Skill DeFi Agent",
  "version": "1.2.0",
  "description": "Unified DeFi agent supporting swapping, lending, and liquidity operations",
  "url": "https://api.myagent.com",
  "capabilities": {
    "streaming": true,
    "pushNotifications": false,
    "stateTransitionHistory": true
  },
  "skills": [
    {
      "id": "token-swapping",
      "name": "Token Swapping",
      "description": "Swap tokens via Camelot DEX on Arbitrum",
      "tags": ["defi", "swapping", "camelot"],
      "examples": ["Swap 100 USDC for ETH", "Exchange DAI to USDT"]
    },
    {
      "id": "lending-operations",
      "name": "Lending Operations",
      "description": "Supply, borrow, repay, withdraw via Aave",
      "tags": ["defi", "lending", "aave"],
      "examples": ["Supply 1000 USDC", "Borrow 0.5 ETH"]
    }
  ],
  "endpoints": {
    "mcp": "/mcp",
    "health": "/health",
    "sse": "/sse"
  },
  "metadata": {
    "supportedChains": ["arbitrum"],
    "protocols": ["aave", "camelot"],
    "lastUpdated": "2025-01-15T10:30:00Z"
  }
}
```

#### **Agent Card Benefits**

- **Automatic Discovery**: Find agents by capability or protocol
- **Integration Planning**: Understand available skills before integration
- **Health Monitoring**: Check agent status and endpoints
- **Version Management**: Track compatibility and updates
- **Capability Matching**: Route requests to appropriate agents

---

### 🔍 Service Discovery Patterns

#### **Registry-Based Discovery**

Build agent registries for dynamic service discovery:

```ts
// discovery/AgentRegistry.ts
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

      console.log(`✅ Registered: ${agentCard.name} at ${url}`);
    } catch (error) {
      console.error(`❌ Failed to register agent at ${url}:`, error.message);
    }
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

  findAgentsByProtocol(protocol: string): AgentCard[] {
    return Array.from(this.agents.values()).filter(agent =>
      agent.metadata?.protocols?.includes(protocol)
    );
  }
}
```

#### **Capability-Based Routing**

Route requests to appropriate agents based on capabilities:

```ts
// orchestration/CapabilityRouter.ts
export class CapabilityRouter {
  constructor(private registry: AgentRegistry) {}

  async routeRequest(capability: string, request: any): Promise<any> {
    const candidates = this.registry.findAgentsByCapability(capability);

    if (candidates.length === 0) {
      throw new Error(`No agents found for capability: ${capability}`);
    }

    // Simple load balancing - pick first healthy agent
    for (const agent of candidates) {
      try {
        const health = await this.checkHealth(agent.url);
        if (health.status === 'healthy') {
          return await this.callAgent(agent, request);
        }
      } catch (error) {
        console.warn(`Agent ${agent.name} unhealthy, trying next...`);
      }
    }

    throw new Error(`No healthy agents available for: ${capability}`);
  }

  private async checkHealth(url: string): Promise<HealthStatus> {
    const response = await fetch(`${url}/health`);
    return response.json();
  }

  private async callAgent(agent: AgentCard, request: any): Promise<any> {
    // Use MCP client to call agent skill
    const mcpClient = new Client({ name: 'router', version: '1.0.0' }, { capabilities: {} });

    const transport = new StreamableHTTPClientTransport(new URL(`${agent.url}/mcp`));

    await mcpClient.connect(transport);
    return await mcpClient.callTool(request.skill, request.arguments);
  }
}
```

---

### 🌐 Integration Patterns

#### **MCP Client Integration**

Connect to v2 agents from external systems:

```ts
// clients/AgentClient.ts
export class AgentClient {
  private client: Client;
  private transport: StreamableHTTPClientTransport;

  constructor(private agentUrl: string) {
    this.transport = new StreamableHTTPClientTransport(new URL(`${agentUrl}/mcp`));

    this.client = new Client({ name: 'external-client', version: '1.0.0' }, { capabilities: {} });
  }

  async connect(): Promise<void> {
    await this.client.connect(this.transport);
  }

  async getAgentCard(): Promise<AgentCard> {
    const response = await fetch(`${this.agentUrl}/.well-known/agent.json`);
    return response.json();
  }

  async callSkill(skillId: string, args: any): Promise<any> {
    return await this.client.callTool(skillId, args);
  }

  async getAvailableSkills(): Promise<string[]> {
    const tools = await this.client.listTools();
    return tools.tools.map(tool => tool.name);
  }

  async disconnect(): Promise<void> {
    await this.client.close();
  }
}

// Usage
const client = new AgentClient('http://localhost:3000');
await client.connect();

const card = await client.getAgentCard();
console.log(`Connected to: ${card.name} v${card.version}`);

const result = await client.callSkill('token-swapping', {
  instruction: 'Swap 100 USDC for ETH',
  walletAddress: '0x123...',
});
```

#### **Frontend Integration**

Integrate with web frontends using agent cards:

```ts
// frontend/AgentIntegration.ts
export class FrontendAgentManager {
  private availableAgents: AgentCard[] = [];

  async discoverAgents(agentUrls: string[]): Promise<void> {
    const discoveries = agentUrls.map(async url => {
      try {
        const response = await fetch(`${url}/.well-known/agent.json`);
        const card: AgentCard = await response.json();
        return { ...card, url };
      } catch (error) {
        console.warn(`Failed to discover agent at ${url}`);
        return null;
      }
    });

    const results = await Promise.allSettled(discoveries);
    this.availableAgents = results
      .filter(result => result.status === 'fulfilled' && result.value)
      .map(result => (result as PromiseFulfilledResult<AgentCard>).value);
  }

  getAgentsByCapability(tags: string[]): AgentCard[] {
    return this.availableAgents.filter(agent =>
      agent.skills.some(skill => tags.some(tag => skill.tags.includes(tag)))
    );
  }

  getSkillsForUI(): UISkill[] {
    return this.availableAgents.flatMap(agent =>
      agent.skills.map(skill => ({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        examples: skill.examples,
        agentName: agent.name,
        agentUrl: agent.url,
      }))
    );
  }
}
```

---

### 🔧 Health Monitoring & Observability

#### **Built-in Health Endpoints**

Every v2 agent provides health monitoring:

```ts
// GET /health
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

#### **Monitoring Integration**

Monitor agent health across your infrastructure:

```ts
// monitoring/HealthMonitor.ts
export class HealthMonitor {
  constructor(private registry: AgentRegistry) {}

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

  async getSystemHealth(): Promise<SystemHealth> {
    const reports = await this.checkAllAgents();

    const healthy = reports.filter(r => r.status === 'healthy').length;
    const total = reports.length;

    return {
      overall: healthy === total ? 'healthy' : 'degraded',
      agentsTotal: total,
      agentsHealthy: healthy,
      agentsUnhealthy: total - healthy,
      lastCheck: new Date(),
      reports,
    };
  }
}
```

---

### ✅ Summary

The v2 framework's modern transport and service discovery features enable:

- **Modern Performance**: StreamableHTTP transport with legacy SSE fallback
- **Automatic Discovery**: Agent cards provide service metadata and capabilities
- **Production Monitoring**: Built-in health checks and observability
- **Integration Flexibility**: MCP clients, frontend integration, capability routing
- **Service Architecture**: Registry patterns, load balancing, health monitoring

These features make v2 agents production-ready and easily integrated into larger systems.

> "Modern transport makes agents fast. Service discovery makes them findable."

| Feature                | Benefit                         | Use Case                  |
| ---------------------- | ------------------------------- | ------------------------- |
| **StreamableHTTP**     | Better performance, reliability | New integrations          |
| **Legacy SSE**         | Backwards compatibility         | Existing clients          |
| **Agent Cards**        | Service discovery, metadata     | Registration, routing     |
| **Health Endpoints**   | Monitoring, observability       | Production operations     |
| **Capability Routing** | Dynamic service selection       | Multi-agent systems       |
| **Registry Patterns**  | Centralized discovery           | Infrastructure management |
