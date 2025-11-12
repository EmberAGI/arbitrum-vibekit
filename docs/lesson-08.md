---
title: "Testing and Quality Assurance"
category: "intermediate"
difficulty: "intermediate"
duration: "15 minutes"
prerequisites: ["lesson-07"]
next_lesson: "lesson-09"
framework_version: "3.0+ (Agent Node)"
last_updated: "2025-10-15"
tags: ["testing","quality","tdd"]
---

# **Lesson 8: Using External Providers and Adapters**

---

### 🔍 Overview

Your agent doesn't need to reimplement everything from scratch. Many tools you need—like price feeds, transaction builders, or chain explorers—are already available as **external MCP servers**, either:

- **Built into the framework** (under `arbitrum-vibekit/providers`), or
- **Hosted by third parties**, documented with connection details to their MCP server (base URL, tool names, and parameters)

You can call these tools directly from your agent, or **wrap them in adapters** that customize behavior, validate input/output, or layer on extra features like x402 paywalls.

---

### 🌐 Provider MCP Servers (Built-in)

The framework comes with a growing library of ready-made services:

- **Ember AI** (Remote): On-chain DeFi execution via `@https://api.emberai.xyz/mcp`
- `providers/allora`: Token price forecasting
- `providers/trendmoon`: Social sentiment metrics

Remote services like Ember AI are accessed via MCP connections, while local providers are MCP servers you can run directly. Both can be **treated like any other tool** in your agent, or passed directly to the LLM.

#### **Connecting to Remote Ember AI**

To use Ember AI's remote MCP server in your agent:

```bash
# .env
EMBER_ENDPOINT=@https://api.emberai.xyz/mcp
```

The framework automatically handles the connection setup using `StreamableHTTPClientTransport`. In your context provider or tools, access the client as:

```ts
const emberClient = deps.mcpClients['ember'];
```

**Note:** The deprecated `emberai-mcp` local folder has been replaced by this remote service. Update your environment variables and client references accordingly.

---

### ↺ Calling Third-Party MCP Tools

You can also call any remote MCP endpoint published by a third party. These might power:

- Commercial APIs (e.g., Chainlink, Etherscan)
- Hosted models or workflows
- Internal company tools with public schemas

Just follow the endpoint's MCP documentation, and use your agent as an **MCP client** to call them.

---

### 🌐 Adapters: Customize or Extend Behavior

Adapters are files in `adapters/` that **wrap existing tools** (usually providers). They:

- Translate schemas (e.g., map `symbol` to `chain/address`)
- Inject extra logic (e.g., insert a `withPaywall` decorator)
- Transform results before returning to the LLM
- Add logging, validation, or retries

They use the **same before/after hook pattern** as your normal tools, so you can modify behavior without copying the whole implementation.

Example:

```ts
import { getPrice } from 'arbitrum-vibekit/providers/price';
import { withPaywall } from 'arbitrum-vibekit/paywall';

export const before = ctx => {
  ctx.args.symbol = ctx.args.symbol.toUpperCase();
};

export default withPaywall(getPrice, { pct: 0.01 });
```

---

### ✅ Summary

- Use **built-in providers** for common infrastructure (price, wallet, etc.)
- Call **third-party MCP servers** directly when needed
- Create **adapters** when you want to modify or augment their behavior

> "Providers give you power. Adapters give you control."

| Decision                                   | Rationale                                                                                                                                                  |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Providers = MCP servers**                | Clarifies that agents _call_ framework-bundled services via MCP, rather than importing SDK clients—maintains a uniform tool-calling model.                 |
| **Adapters reuse hook/decorator patterns** | No new API surface: you wrap third-party tools with the same `before`/`after` and decorator primitives you already know, so there’s one mental model.      |
| **Adapters instead of forking**            | When upstream schemas or behavior change, you update a single adapter file—core agent logic and provider code remain untouched.                            |
| **Built-in provider catalogue**            | Gives juniors immediate access to common infrastructure (price feeds, execution engines, analytics) without external configuration or credit-card sign-up. |
