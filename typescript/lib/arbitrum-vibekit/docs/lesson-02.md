# **Lesson 2: Understanding MCP (Model Context Protocol)**

---

### 🔍 Overview

> 🧩 **Note:** In our framework, MCP serves primarily as a compatibility layer. Under the hood, all tool calls—even MCP ones—use the A2A schema. This lets our agents remain modular and interoperable while supporting the broad ecosystem of MCP-compatible LLMs.

MCP (Model Context Protocol) is a standardized interface that lets an LLM agent call external tools as if they were part of its own internal reasoning process. In our framework, an agent registers itself as a **single MCP tool** (e.g., `askXAgent`) that handles natural language input. This gives LLMs the ability to delegate work to the agent, without the agent needing to expose multiple tools or schemas directly.

MCP is widely supported by LLM frameworks and is the primary way LLMs interact with agents in our system.

---

### ⚙️ Key Concepts

- **LLM-as-Agent**: The LLM, acting as an agent, delegates work to another agent (yours) by calling it as a tool.

- **Tool Schema**: MCP tools describe their interface using JSON Schema, so the LLM knows what parameters to provide.

- **Tool Invocation**: The LLM calls a tool by name with arguments, and receives structured output.

- **LLM = Agent**: Even though the call originates from a model, it acts as an agent delegating to another agent (yours).

- **Stateless Invocation**: MCP tools are expected to be stateless, but your agent can internally manage task state if needed.

---

### 🧰 MCP Agent Flow (Simplified)

1. **Your agent starts an MCP server** and exposes one tool: `askXAgent`
2. **The LLM sees the schema** for that tool and generates a call like:

   ```json
   {
     "tool": "askXAgent",
     "args": { "query": "What's the current ETH price?" }
   }
   ```

3. **Your agent receives the call**, does internal work (e.g. maps "ETH" to a token ID and queries a price), and returns the result.

---

### 🧠 Agent-Orchestration Pattern

#### Why This Pattern?

> ℹ️ **Note:** Our use of MCP differs slightly from the most common pattern. Typically, MCP is used to expose multiple small tools directly to the LLM. Instead, we expose a full agent as a single MCP tool that handles natural language input. This approach remains fully compliant with the MCP standard, while offering better modularity, orchestration, and simplicity for agents focused on single responsibilities.

This design keeps the outer interface simple—just one tool call—while allowing the agent to coordinate multiple internal tools or agents as needed.

For example, one agent might handle crypto price lookups, another manages wallet transactions, and a third coordinates multi-step trades using both.

When you expose **multiple agents**—each as its own MCP tool—an outer agent or LLM can orchestrate those specialized agents in turn. Each agent retains a focused, single responsibility (e.g., pricing, reporting, transaction building), which prevents context overload, boosts individual tool performance, and enhances the overall "swarm" of agents working together. We will explore this swarm orchestration pattern further in upcoming lessons on both MCP-based composition and A2A delegation, where you'll see how agents can coordinate over either protocol.

---

### ✨ Why We Use MCP

- **LLM-friendly**: Most modern LLMs and toolcalling systems support it.
- **Composable**: You can chain MCP-based agents together.
- **Secure**: It enforces schema validation and has strong boundaries.
- **Unified**: One clean interface instead of many custom endpoints.

---

### 🔌 Agent Connectivity

Agents in this framework operate as both **MCP servers** and **MCP clients**. This means they can expose themselves as tools to others **and** call other agents using the same shared schema (A2A). This dual role allows agents to be composed into chains, loops, or swarms without extra glue code.

---

### ✅ Summary

MCP is the language LLMs use to talk to agents. In our framework, your agent becomes a single MCP tool that handles natural language requests. This allows the LLM to delegate work while your agent keeps full control over internal logic, validation, and behavior. This agent-as-tool pattern enables a simple LLM call to trigger complex, structured workflows behind the scenes.

> "MCP makes agents look like tools, and tools feel like native LLM abilities."

| Decision                             | Rationale                                                                                                                                                                                |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MCP kept as compatibility veneer** | Widely adopted by model hosts; gives instant LLM/tool-calling support without custom adapters.                                                                                           |
| **Agent-as-tool pattern**            | One of the simplest yet most powerful orchestration patterns that often solves the problem at hand.                                                                                      |
| **Internal mapping to A2A**          | All MCP payloads converted to A2A Tasks, so downstream logic is uniform.                                                                                                                 |
| **Schema delivered at runtime**      | Schemas are provided dynamically from an MCP server to clients for direct LLM consumption; Zod isn't needed on the client, but must be used on the server to validate incoming requests. |
| **Adapters layer on top**            | If third-party schema changes, only the adapter file needs an update—core agent logic untouched.                                                                                         |
