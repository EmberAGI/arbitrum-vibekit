---
title: "Building Your First Agent"
category: "beginner"
difficulty: "intermediate"
duration: "15 minutes"
prerequisites: ["lesson-03"]
next_lesson: "lesson-05"
framework_version: "3.0+ (Agent Node)"
last_updated: "2025-10-15"
tags: ["first-agent", "hands-on", "tutorial"]
---

# **Lesson 4: Understanding Agent-to-Agent Protocol (A2A)**

---

### 🔍 Overview

> 🧩 **Note:** In our framework, A2A is not just an alternative to MCP—it’s the **shared schema** used for all tool interactions. Our MCP tools internally speak A2A. This lets us support the MCP standard (for compatibility with most LLM systems) while maintaining a consistent internal protocol across agents.

The Agent-to-Agent Protocol (A2A) lets agents talk directly to each other—delegating tasks, sharing work, and streaming updates. It’s used for peer-level agent coordination, while MCP is more suited to LLM compatibility. A2A focuses on simplicity, decentralization, and modularity.

A2A is ideal for orchestrating complex or long-running workflows across multiple agents, and it's the foundation for what we call a "swarm" of collaborative agents.

---

### ⚙️ Key Concepts

- **Agent Cards**: Each agent publishes a card with its ID, capabilities, endpoints, and authentication details.
- **Protocol + Message Schema**: A2A defines both the wire protocol (HTTP POST / JSON-RPC or SSE) and the message schema (`thread_id`, `type`, `payload`, streaming flags).
- **Task Delegation**: Agents send tasks to each other using structured messages over HTTP.
- **Task Threads**: Each delegated task uses a unique `thread_id`, enabling stateful back-and-forth and traceability.
- **Streaming Updates**: Agents can push incremental results or progress via SSE.
- **Long-running Tasks**: Perfect for loops, monitoring, or multi-phase actions, with cancellation support.

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

While MCP and A2A both support core principles like delegation, observability, and streaming, we use A2A directly when we want:

- **Decentralization**: Agents discover and communicate peer-to-peer without central registry requirements
- **Minimal Overhead**: Simpler message structure, no external model runtime needed
- **Self-Hosting Simplicity**: Agents can be hosted anywhere, by anyone, without MCP wrappers
- **Decoupling**: Each agent can evolve independently
- **Delegation**: Agents offload parts of a task they don't specialize in
- **Streaming**: Results can flow back incrementally
- **Observability**: Each task is tracked and traceable
- **Swarm-friendly**: Ideal for multi-agent collaboration

A2A is the internal backbone of all agent communication—even tools exposed via MCP ultimately speak A2A internally.

---

### 🧩 Agent Interoperability

Every agent is both an **MCP server** (so others can call it) and an **MCP client** (so it can call others). This lets agents chain together naturally—each one speaking the same A2A message format, no matter how it’s wrapped.

---

### ✅ Summary

A2A gives agents a shared protocol—both in message format and transport—so they can delegate, stream, and coordinate tasks in a decentralized swarm. Each agent remains focused on a single responsibility, and the shared A2A schema keeps orchestration predictable and scalable.

> "A2A gives agents a voice. Swarms give them purpose."

| Decision                             | Rationale                                                                                                       |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| **Protocol _and_ schema emphasised** | Devs understand A2A is not just “send JSON” but a full task envelope with `thread_id`, streaming, errors.       |
| **Decentralised discovery**          | Agents can publish cards to any registry—or just a URL—eliminating single-point directories.                    |
| **Task threads & streaming**         | Enables long-running loops, partial results, and cancellation with a single construct.                          |
| **Why choose A2A over raw MCP**      | Lower overhead (no model gateway), peer-to-peer, self-hosting ease; yet same delegation/observability benefits. |
| **Swarm pattern reinforced**         | Shows how outer LLM delegates to coordinator-agent via MCP, which fans out to specialist agents via A2A.        |
