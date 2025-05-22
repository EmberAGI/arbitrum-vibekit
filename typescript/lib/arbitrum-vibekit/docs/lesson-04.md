# **Lesson 4: Stateless vs Stateful Logic**

---

### 🔍 Overview

> 🧩 **Note:** Every agent call—whether via MCP or direct A2A—creates a **Task** object (threadId) as defined by the A2A schema. Tasks can be used statefully (progress tracking, streaming updates) or statelessly (simple, one-off invocations) ([google.github.io](https://google.github.io/A2A/specification/agent-to-agent-communication/?utm_source=chatgpt.com), [news.ycombinator.com](https://news.ycombinator.com/item?id=43631381&utm_source=chatgpt.com)).

In our framework, **stateless vs stateful** is a core design dimension—not just for tools, but for all agent logic, including direct A2A tasks. While MCP tool calls are the most common entrypoint for LLMs, agents often coordinate using A2A, where not everything looks like a tool function.

A **stateless process** computes results using only the current input. A **stateful process** uses external context or stores data across time.

Whether you’re writing an MCP tool, an A2A task handler, or an internal agent function, understanding the boundary between stateless and stateful will help you keep logic testable, reusable, and composable.

---

### ⚖️ Stateless Logic

A **stateless tool** doesn’t remember anything. It computes based on its input alone.

- ✅ Easy to test and cache
- ✅ Safe to retry or parallelize
- ❌ No memory or long-term task coordination

Examples:

- `getPrice({ symbol: "ETH" })`
- `formatTimestamp({ unix: 1690000000 })`

Stateless logic can run anywhere, scale horizontally, and is ideal for quick operations with no side effects. It applies equally to MCP tools, A2A handlers, and internal helpers.

---

### 🔒 Stateful Logic

A **stateful tool** interacts with memory or persistent context. In our framework, state is managed at the agent level (not inside the tool function).

Your logic function may expose a stateless interface, but can still interact with agent state such as:

- A **task state** (using a `taskId`) for long-running workflows
- The **global store** (shared across all tool calls)

Examples:

- `crawlUrl({ url })` that appends chunks to a task buffer
- `startWorkflow({ ... })` that creates or updates a task record

This pattern is especially powerful for agents that manage conversations, memory buffers, long-running processes, or collaborative A2A workflows.

In fact, most **A2A tasks** are inherently stateful. Each task includes a `threadId` and may evolve over time through streaming updates, cancellation, or coordination with other agents.

---

### 🔌 Choosing Stateless vs Stateful Design

Use a stateless tool when:

- You can compute a response entirely from the input
- You want to scale or retry it easily

Use a stateful tool when:

- You need to persist progress between calls
- The tool is part of a workflow or task stream

If in doubt, **build it stateless first**, and reach for state only when needed.

---

### ✅ Summary

- **Stateless logic** is simple, fast, and repeatable. Ideal for tools and handlers that don’t need memory.
- **Stateful logic** supports long-lived coordination, tracked tasks, and richer agent workflows.

This choice applies across the board—from individual tools to full A2A task handlers.

> "A stateless tool solves a problem. A stateful one solves a process."
