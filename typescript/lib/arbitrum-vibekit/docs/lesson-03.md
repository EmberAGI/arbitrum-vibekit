# **Lesson 3: Understanding Agent-to-Agent Protocol (A2A)**

---

### 🔍 Overview

> 🧩 **Note:** In our framework, A2A is not just an alternative to MCP—it’s the **shared schema** used for all tool interactions. Our MCP tools internally speak A2A. This lets us support the MCP standard (for compatibility with most LLM systems) while maintaining a consistent internal protocol across agents.

The Agent-to-Agent Protocol (A2A) lets agents talk directly to each other—delegating tasks, sharing work, and streaming updates. It’s used for peer-level agent coordination, while MCP is more suited to LLM compatibility. A2A focuses on simplicity, decentralization, and modularity.

A2A is ideal for orchestrating complex or long-running workflows across multiple agents, and it's the foundation for what we call a "swarm" of collaborative agents.

---

### ⚙️ Key Concepts

- **Agent Cards**: Each agent publishes a card describing who it is, what it can do, and how to reach it.
- **Task Delegation**: Agents send tasks to each other over HTTP using a structured message format.
- **Task Threads**: Each delegated task is tracked using a unique thread ID, allowing for stateful back-and-forth.
- **Streaming Updates**: Agents can send real-time updates back to the task originator via SSE (server-sent events).
- **Long-running Tasks**: Perfect for loops, monitoring, or multi-phase actions.

---

### ➡️ A2A Agent Flow (Simplified)

1. Agent A discovers Agent B's agent card. (This can be via static URL, peer registry, or service broadcast depending on your swarm setup.)
2. Agent A sends a task to Agent B using an HTTP POST.
3. Agent B performs the task and streams results or returns a final response.
4. Agent A can subscribe to updates, poll for status, or cancel the task if needed.

---

### 🧠 Swarm Pattern

Using A2A, you can build a decentralized network of agents that each perform a specific responsibility:

- A "wallet agent" signs and submits transactions
- A "price agent" fetches live token data
- A "workflow agent" coordinates multi-step actions

Agents work together over A2A while staying cleanly separated. This keeps responsibilities modular, reduces context bloat, and makes the swarm easy to extend or maintain.

MCP is still used as the entrypoint for LLMs because it's widely adopted and enables out-of-the-box compatibility with most model providers. However, our agents speak A2A internally—even when wrapped in MCP—so that they can work seamlessly in a swarm or be plugged together like Lego blocks. It’s what allows simple MCP compatibility on the outside, with powerful internal A2A communication under the hood.

---

### ✨ Why Use A2A Instead of MCP Directly

MCP and A2A both support key principles like decoupling, delegation, streaming, observability, and swarm collaboration. The choice to use A2A directly comes down to its advantages in decentralized coordination, minimal overhead, and self-hosted simplicity:

- **Decentralization**: Agents discover and talk to each other directly.
- **Minimal Overhead**: No need for extra schema wrapping or tool registration.
- **Self-Hosting Simplicity**: Agents can run anywhere without upstream model integration.
- **Decoupling**: Each agent can evolve independently.
- **Delegation**: Agents offload parts of a task they don’t specialize in.
- **Streaming**: Results can flow back incrementally.
- **Observability**: Each task is tracked and traceable.
- **Swarm-friendly**: Ideal for multi-agent collaboration.

---

### 🧩 Agent Interoperability

Every agent is both an **MCP server** (so others can call it) and an **MCP client** (so it can call others). This lets agents chain together naturally—each one speaking the same A2A message format, no matter how it’s wrapped.

---

### ✅ Summary

A2A gives agents a shared protocol for communication and collaboration. It supports delegation, streaming, long-running tasks, and clean separation of concerns. It enables swarm-based orchestration, where many small agents coordinate to solve complex problems in a modular, scalable way.

> "A2A gives agents a voice. Swarms give them purpose."
