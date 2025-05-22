# **Lesson 6: Folder Structure and File Layout**

---

### 📂 Overview

Our agent framework is designed to be modular, lightweight, and beginner-friendly. This lesson explains the default folder structure and how each piece connects—so you always know where to look (or add) when building new tools, hooks, or stateful workflows.

This structure isn’t strict, but it helps keep things clean and composable.

---

### 📁 Agent Repo Layout

_Tools, state slices, and configuration specific to your agent._

```plaintext
my-agent/
├── tools/            # Custom MCP/A2A tool definitions
│   └── swapToken.ts
├── adapters/         # Adapters around third‑party provider tools
│   └── priceAdapter.ts
├── state/            # Optional: selectors/reducers for custom slices
│   └── selectors.ts
├── config.ts         # Agent metadata (name, fees, capabilities)
└── index.ts          # Entrypoint: imports startAgent from `arbitrum-vibekit`
```

**Framework‑provided modules (via `arbitrum-vibekit`)**

- **Provider MCP servers** (`providers/*`): ready‑made external services (price feeds, RPC, e‑mail) that your agent can call as tools.
- **Error handling** (`createErrorMiddleware`, `AgentError`, `wrapAsync`).
- **Paywall** (`withPaywall` decorator).
- **A2A helpers** (`createLoopTask`, `sendTask`, task schemas).
- **Global store** (`createGlobalStore`, Immer store bootstrap).
- **Server scaffolding** (`startAgent` to wire up MCP/A2A endpoints).

---

### 🛠️ File Roles

#### In Agent Repo

- `tools/`: Your custom tool files (schema, `impl`, hooks).
- `adapters/`: Adapters that modify or extend provider tools (e.g., symbol→address mapper, paywall decorator). Adapters can use the **same before/after hook pattern** for custom logic.
- `state/`: Agent‑specific selectors or reducers using the global store.
- `config.ts`: Agent name, pricing, capabilities, env vars.
- `index.ts`: `startAgent({ config, tools })` from `arbitrum-vibekit`.

#### Provided by `arbitrum-vibekit`

- **errors/**: Centralized `AgentError` class, Express error middleware, `wrapAsync`.
- **paywall/**: `withPaywall` decorator and fee calculation helpers.
- **a2a/**: Helpers for task delegation, loop management, and SSE streaming.
- **state/**: `createGlobalStore` to bootstrap and manage the agent store via Immer.
- **server.ts**: Framework code to wire MCP and A2A HTTP endpoints and start the server.

---

### ✅ Summary

This default layout separates responsibilities cleanly:

- **tools/** = logic
- **state/** = memory
- **a2a/** = coordination
- **paywall/** = monetization
- **errors/** = resilience

You can always rearrange as your agent grows—but this structure gives you a scalable, legible starting point.

> "Folders are mental boundaries. Structure helps you think clearly before you code."
