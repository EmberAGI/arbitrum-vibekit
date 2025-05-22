# **Lesson 1: What is an AI Agent in Our Framework?**

---

### 🔍 Overview

An AI agent in our framework is a lightweight, self-contained service that exposes one or more tools (functions) to perform useful work—typically with the help of a language model (LLM). It can be called directly (via HTTP or MCP) or indirectly (via another agent using A2A). Some agents are purely stateless. Others manage memory, long-running tasks, or even payment logic.

Agents can run anywhere: on your laptop, in the cloud, or inside a container. The framework is designed to be simple, pluggable, and understandable by junior developers with minimal setup.

---

### 🛠 What Does an Agent Do?

- **Expose a single entrypoint tool**, e.g. `askXAgent`, which accepts free-form natural-language requests. Internally, the agent orchestrates other tools or agents under the hood.
- **Accept input** from a user, another agent, or a language model.
- **Run those tools** with optional logic before/after each call.
- **Return a response**, which might be plain data, a signed transaction, a streamed answer, or a delegated task.

---

### 🌐 Agent Communication

> ℹ️ **Note:** In our framework, every agent acts as both an MCP server **and** an MCP client. This means agents can both expose themselves as tools (for LLMs or other agents to call) and also call other agents as tools. Under the hood, all tool calls follow the same A2A schema—so agents can be chained, composed, or orchestrated like Lego blocks using a shared protocol.

Agents can be called in multiple ways:

- **HTTP or CLI**
- **Model Context Protocol (MCP)**

  - Used when an LLM is calling your agent as a tool (not direct A2A)
  - Schema-based and compatible with many LLM frameworks

- **Agent-to-Agent Protocol (A2A)**

  - Used when another agent wants to delegate work to yours
  - Supports long-running tasks and streams

### ⚖ Stateless vs. Stateful Agents

- **Stateless agents**:

  - Don't remember anything between calls
  - Easy to cache and scale

- **Stateful agents**:

  - Can track long-running tasks, store memory, or manage workflows
  - Use simple built-in helpers to manage global or per-task state

You choose which model you need per use case.

---

### 💡 Why Agents Are Useful

Agents provide a clean boundary around logic you want to:

- Isolate
- Secure
- Reuse
- Chain together with other agents

They simplify LLM-driven workflows, let you enforce logic and validation, and allow you to charge for services via micro-payments if desired.

---

### ✅ Summary

An **agent is a tool-powered, LLM-friendly function server** that can be stateless or stateful, and can collaborate with other agents over a standard protocol. It handles requests, executes logic, manages optional state, and returns structured results—all in a way that's easy to scale and extend.

> “Agents are just functions with context, coordination, and control—wrapped in a simple service shell.”
