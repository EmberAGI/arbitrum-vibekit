---
title: "Understanding MCP (Model Context Protocol)"
category: "beginner"
difficulty: "intermediate"
duration: "20 minutes"
prerequisites: ["lesson-02"]
next_lesson: "lesson-04"
framework_version: "3.0+ (Agent Node)"
last_updated: "2025-10-15"
tags: ["mcp", "protocol", "integration"]
---

# **Lesson 3: Understanding MCP (Model Context Protocol) in V2**

---

### 🔍 Overview

> 🧩 **Note:** In the v2 framework, MCP serves as the primary interface for LLM integration while internally using the A2A schema for consistency. Skills are exposed as MCP tools, and the modern StreamableHTTP transport provides better performance and reliability than legacy SSE.

MCP (Model Context Protocol) in the v2 framework enables LLMs to interact with agent skills as if they were native tool calls. Unlike exposing individual tools directly, v2 agents expose **skills** as MCP tools - each skill represents a high-level capability that intelligently coordinates multiple internal tools through LLM orchestration.

This design keeps the LLM interface clean while allowing complex multi-tool workflows behind the scenes.

---

### ⚙️ Key V2 Concepts

- **Skills as MCP Tools**: Each skill becomes a single MCP tool with natural language input
- **Modern Transport**: StreamableHTTP is default, with legacy SSE support for backwards compatibility
- **Agent Cards**: Automatic service discovery via `/.well-known/agent.json`
- **LLM Orchestration**: Skills intelligently route to appropriate internal tools
- **Schema Generation**: Skills automatically generate MCP schemas from Zod definitions

---

### 🧰 V2 MCP Agent Flow

1. **Agent publishes skills as MCP tools** using modern StreamableHTTP transport
2. **LLM discovers available skills** from the agent's exposed tool schemas
3. **LLM calls a skill** with natural language input:

   ```json
   {
     "name": "lending-operations",
     "arguments": {
       "instruction": "I want to supply 100 USDC to earn yield",
       "walletAddress": "0x123..."
     }
   }
   ```

4. **Skill uses LLM orchestration** to route to appropriate tools internally
5. **Agent returns structured response** with transaction data or results

---

### 🏗️ Modern Transport Architecture

#### **StreamableHTTP (Default)**

The v2 framework uses StreamableHTTP as the primary transport:

```ts
// Automatically configured in v2 agents
const agent = Agent.create(agentConfig, {
  llm: { model: providers.openrouter("google/gemini-2.5-flash") },
});

// Exposes MCP at: http://localhost:3000/mcp
await agent.start(3000);
```

#### **Legacy SSE Support**

For backwards compatibility with older MCP clients:

```ts
// Enable legacy SSE transport
const runtimeOptions = {
  enableLegacySseTransport: true, // Adds /sse endpoint
  llm: { model: selectedModel },
};

// Provides both:
// - Modern: http://localhost:3000/mcp (StreamableHTTP)
// - Legacy: http://localhost:3000/sse (Server-Sent Events)
```

#### **Transport Comparison**

| Feature         | StreamableHTTP (Default)     | SSE (Legacy)            |
| --------------- | ---------------------------- | ----------------------- |
| **Performance** | Optimized, bidirectional     | Adequate                |
| **Reliability** | Built-in retry, backpressure | Manual handling         |
| **Standards**   | Latest MCP SDK               | Original MCP            |
| **Use Case**    | New integrations             | Backwards compatibility |

---

### 🎯 Skills-Based MCP Pattern

#### **Why Skills Instead of Direct Tools?**

Traditional MCP often exposes many individual tools. V2 uses skills for better organization:

```ts
// V2 Pattern: Skills as capabilities
export const lendingSkill = defineSkill({
  id: "lending-operations",
  name: "Lending Operations",
  description: "Perform lending operations on Aave protocol",

  inputSchema: z.object({
    instruction: z.string().describe("Natural language lending request"),
    walletAddress: z.string().describe("User wallet address"),
  }),

  // Internal tools (not exposed to LLM directly)
  tools: [supplyTool, borrowTool, repayTool, withdrawTool],

  // LLM orchestration handles routing
});
```

#### **LLM Sees Clean Interface**

The LLM only sees the skill, not internal complexity:

```json
{
  "name": "lending-operations",
  "description": "Perform lending operations on Aave protocol",
  "parameters": {
    "type": "object",
    "properties": {
      "instruction": {
        "type": "string",
        "description": "Natural language lending request"
      },
      "walletAddress": {
        "type": "string",
        "description": "User wallet address"
      }
    }
  }
}
```

#### **Skill Handles Complexity Internally**

When the LLM calls the skill, it orchestrates tools automatically:

```
LLM calls: lending-operations("Supply 1000 USDC then borrow 500 DAI", "0x123...")
↓
Skill LLM orchestration:
1. Analyzes: Two operations needed
2. Routes to: supplyTool({ token: "USDC", amount: 1000, ... })
3. Then routes to: borrowTool({ token: "DAI", amount: 500, ... })
4. Returns: Combined transaction data and status
```

---

### 🔧 Agent Card & Discovery

Every v2 agent automatically exposes discoverable metadata:

```json
// GET /.well-known/agent.json
{
  "name": "Lending Agent",
  "version": "1.0.0",
  "description": "A DeFi lending agent for Aave protocol",
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
    "mcp": "/mcp",
    "health": "/health"
  }
}
```

This enables:

- **Service Discovery**: Find agents by capability
- **Integration Planning**: Understand available skills
- **Health Monitoring**: Check agent status
- **Version Management**: Track compatibility

---

### 🧠 Agent-Orchestration Benefits

#### **Clean LLM Interface**

- Single skill call instead of complex tool orchestration
- Natural language input reduces prompt engineering
- LLM doesn't need to understand internal tool relationships

#### **Powerful Internal Coordination**

- Skills can coordinate multiple tools automatically
- Complex workflows handled transparently
- Error recovery and validation at skill level

#### **Example: Complex Workflow Made Simple**

```
// What LLM sees (simple)
User: "Optimize my DeFi position for maximum yield"
LLM calls: portfolio-optimization("Optimize my DeFi position for maximum yield", "0x123...")

// What happens internally (complex)
Skill orchestrates:
1. getBalancesTool() → Current positions
2. analyzeYieldTool() → Best opportunities
3. calculateRebalanceTool() → Optimal moves
4. executeTradesTool() → Transaction data
5. Return comprehensive optimization plan
```

---

### ✨ V2 MCP Advantages

- **Simplified Integration**: Skills provide high-level capabilities vs low-level tools
- **Modern Transport**: StreamableHTTP performance with SSE fallback
- **Automatic Discovery**: Agent cards enable service discovery
- **LLM-Friendly**: Natural language input, structured output
- **Internal Flexibility**: Change tools without breaking MCP interface
- **Production Ready**: Health checks, monitoring, deployment patterns

---

### 🔌 Agent Interoperability

V2 agents act as both MCP servers and clients:

```ts
// As MCP server: Exposes skills to LLMs
agent.start(3000); // Skills available at /mcp

// As MCP client: Can call other agents' skills
const emberClient = deps.mcpClients["ember"];
const result = await emberClient.callTool("swap-tokens", args);
```

This enables:

- **LLM Integration**: Primary interface for model interactions
- **Agent Composition**: Agents calling other agents
- **Swarm Architectures**: Coordinated multi-agent workflows

---

### ✅ Summary

MCP in the v2 framework provides a modern, skills-based interface for LLM integration. Skills expose high-level capabilities through clean natural language interfaces, while LLM orchestration handles complex internal tool coordination. Modern StreamableHTTP transport provides better performance, with legacy SSE support ensuring backwards compatibility.

> "Skills make complexity simple. MCP makes agents accessible."

| Decision                      | Rationale                                                 |
| ----------------------------- | --------------------------------------------------------- |
| **Skills as MCP tools**       | Cleaner LLM interface, hides internal complexity          |
| **StreamableHTTP default**    | Modern transport with better performance and reliability  |
| **Legacy SSE support**        | Backwards compatibility without holding back architecture |
| **Agent cards for discovery** | Enables service discovery and integration planning        |
| **LLM orchestration**         | Intelligent tool routing without exposing complexity      |
| **Natural language input**    | Reduces prompt engineering, more intuitive for LLMs       |
