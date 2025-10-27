# **Lesson 1: What is an AI Agent in Our Framework?** ⚠️ LEGACY

> **⚠️ DEPRECATED**: This lesson is for the legacy `arbitrum-vibekit-core` framework.
>
> **For Agent Node (v3.0+)**: See [Lesson 28: Agent Node Framework](./lesson-28.md)
>
> This lesson remains for reference but is no longer maintained.

# **Lesson 1: What is an AI Agent in Our Framework?**

---

### 🔍 Overview

An AI agent in the v2 framework is a lightweight, self-contained service that exposes **skills** (high-level capabilities) to perform useful work with the help of a language model (LLM). Each skill groups related **tools** under intelligent LLM orchestration, creating a clean separation between public interfaces and internal implementation.

Agents can be called via MCP (Model Context Protocol) or A2A (Agent-to-Agent Protocol) and can run anywhere: on your laptop, in the cloud, or inside a container. The v2 framework is designed to be simple, powerful, and understandable by developers with minimal setup.

---

### 🛠 What Does an Agent Do?

- **Exposes skills as capabilities**, e.g. `lending-operations`, `token-swapping`, which accept natural-language requests and coordinate multiple tools intelligently
- **Uses LLM orchestration** to route user requests to appropriate tools based on intent
- **Accepts input** from users, other agents, or language models via standardized protocols
- **Executes tools** with optional hooks for validation, transformation, and enhancement
- **Returns structured responses**, which might include transaction data, analysis results, or rich artifacts

---

### 🏗️ V2 Architecture: Skills, Tools, and LLM Orchestration

The v2 framework is built around a three-layer architecture:

#### **Skills (Public Interface)**

Skills define what your agent can do and serve as the public interface:

```ts
export const lendingSkill = defineSkill({
  id: "lending-operations",
  name: "Lending Operations",
  description: "Perform lending operations on Aave protocol",
  tags: ["defi", "lending"],
  examples: ["Supply 100 USDC", "Borrow 50 ETH"],

  inputSchema: z.object({
    instruction: z.string(),
    walletAddress: z.string(),
  }),

  tools: [supplyTool, borrowTool, repayTool, withdrawTool],
  // No handler = LLM orchestration (recommended)
});
```

#### **Tools (Internal Implementation)**

Tools implement the actual business logic:

```ts
const supplyParams = z.object({
  token: z.string(),
  amount: z.number(),
  walletAddress: z.string(),
});

export const supplyTool: VibkitToolDefinition<typeof supplyParams> = {
  name: "supplyToken",
  description: "Supply tokens to Aave lending pool",
  parameters: supplyParams,
  execute: async (args, context) => {
    // Tool implementation here
    return await aave.supply(args.token, args.amount, args.walletAddress);
  },
};
```

#### **LLM Orchestration**

The LLM intelligently routes requests and coordinates tools:

```
User: "I want to supply 100 USDC and then borrow 50 ETH"
↓
LLM Orchestration:
1. Analyzes: Two operations - supply USDC, then borrow ETH
2. Routes: First to supplyTool, then to borrowTool
3. Executes: supplyTool({ token: "USDC", amount: 100, ... })
4. Then: borrowTool({ token: "ETH", amount: 50, ... })
5. Returns: "Successfully supplied 100 USDC and borrowed 50 ETH"
```

---

### 🌐 Agent Communication

In the v2 framework, agents communicate via two primary protocols:

- **Model Context Protocol (MCP)**

  - Primary interface for LLM integration
  - Skills are exposed as MCP tools
  - Compatible with Claude, Cursor, and other MCP clients
  - Uses modern StreamableHTTP transport by default

- **Agent-to-Agent Protocol (A2A)**
  - Direct agent-to-agent communication
  - Supports long-running tasks and streaming
  - Enables swarm architectures and delegation

#### **Agent Cards & Service Discovery**

Every v2 agent automatically publishes an agent card at `/.well-known/agent.json`:

```json
{
  "name": "Lending Agent",
  "version": "1.0.0",
  "description": "A DeFi lending agent for Aave protocol",
  "skills": [
    {
      "id": "lending-operations",
      "name": "Lending Operations",
      "tags": ["defi", "lending"],
      "examples": ["Supply 100 USDC", "Borrow 50 ETH"]
    }
  ],
  "endpoints": {
    "mcp": "/mcp",
    "health": "/health"
  }
}
```

---

### ⚖ Stateless vs. Context-Aware Agents

- **Stateless tools**: Process requests independently without memory between calls
- **Context-aware agents**: Use context providers to share data like token mappings, RPC connections, or user preferences across tools
- **Optional state**: Some agents may use external state stores for persistence

```ts
// Context provider example
export const contextProvider: ContextProvider<MyContext> = async (deps) => {
  return {
    tokenMap: await loadTokenMap(),
    rpcProvider: createProvider(process.env.RPC_URL),
    // ... other shared context
  };
};
```

---

### 💡 Why V2 Agents Are Powerful

The v2 architecture provides:

- **Clear boundaries**: Skills define public interface, tools handle implementation
- **Intelligent orchestration**: LLM routes complex multi-step requests automatically
- **Modularity**: Tools can be reused across skills, skills across agents
- **Extensibility**: Adding new tools expands capability without breaking interfaces
- **Production readiness**: Built-in health checks, metrics, and deployment patterns

---

### 🔧 Modern Development Patterns

#### **Provider Selection**

Unified LLM provider access:

```ts
const providers = createProviderSelector({
  openRouterApiKey: process.env.OPENROUTER_API_KEY,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
});

const agent = Agent.create(agentConfig, {
  llm: { model: providers.openrouter("google/gemini-2.5-flash") },
});
```

#### **Hook Enhancement**

Enhance tools with cross-cutting concerns:

```ts
export const enhancedTool = withHooks(baseTool, {
  before: [validateInputHook, authHook],
  after: [formatResponseHook, metricsHook],
});
```

---

### ✅ Summary

A **v2 agent is a skill-powered, LLM-orchestrated service** that exposes high-level capabilities through intelligent coordination of internal tools. The architecture emphasizes clear separation of concerns: skills define what agents can do, tools implement how they work, and LLM orchestration handles the intelligent routing between them.

> "Skills are promises. Tools are implementations. LLM orchestration is the intelligence that connects them."

| Decision                               | Rationale                                                                   |
| -------------------------------------- | --------------------------------------------------------------------------- |
| **Skills as primary abstraction**      | Creates clear public interface while hiding implementation complexity       |
| **LLM orchestration by default**       | Leverages AI for intelligent routing without requiring manual logic         |
| **Tools always required**              | Maintains consistency and provides implementation even with manual handlers |
| **Modern transport (StreamableHTTP)**  | Latest MCP SDK capabilities with legacy SSE backwards compatibility         |
| **Agent cards for discovery**          | Enables automatic service discovery and capability advertising              |
| **Context providers for shared state** | Clean dependency injection for shared resources across tools                |
