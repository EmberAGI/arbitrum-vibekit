---
title: "Skills and Tool Integration"
category: "intermediate"
difficulty: "intermediate"
duration: "15 minutes"
prerequisites: ["lesson-04"]
next_lesson: "lesson-06"
framework_version: "3.0+ (Agent Node)"
last_updated: "2025-10-15"
tags: ["skills","tools","integration"]
---

# **Lesson 5: Stateless vs Stateful Logic with Context**

---

### 🔍 Overview

In the v2 framework, understanding **stateless vs stateful** logic is crucial for designing tools that are maintainable, testable, and efficient. The key difference lies in whether your tool needs to remember information between calls or access shared data across your agent.

A **stateless tool** computes results using only the current input parameters. A **stateful tool** accesses or modifies shared context that persists across multiple tool invocations.

The v2 framework provides **context providers** as the primary mechanism for managing shared state, replacing the older global state patterns. This approach offers better type safety, clearer dependencies, and more predictable behavior.

---

### ⚖️ Stateless Tools

A **stateless tool** is self-contained and deterministic. Given the same input, it always produces the same output without side effects.

**Benefits:**

- ✅ Easy to test and cache
- ✅ Safe to retry or parallelize
- ✅ No hidden dependencies
- ✅ Predictable behavior

**Examples:**

```ts
// tools/formatPrice.ts
import { z } from 'zod';
import { defineTool } from 'arbitrum-vibekit-core';

const inputSchema = z.object({
  amount: z.number(),
  decimals: z.number(),
  symbol: z.string(),
});

export const formatPriceTool: VibkitToolDefinition<typeof inputSchema> = {
  name: 'formatPrice',
  description: 'Format a token amount with proper decimals',
  parameters: inputSchema,
  execute: async input => {
    const formatted = (input.amount / Math.pow(10, input.decimals)).toFixed(4);
    return `${formatted} ${input.symbol}`;
  },
};
```

```ts
// tools/calculateFee.ts
const calculateFeeParams = z.object({
  amount: z.number(),
  feePercent: z.number(),
});

export const calculateFeeTool: VibkitToolDefinition<typeof calculateFeeParams> = {
  name: 'calculateFee',
  description: 'Calculate fee from amount and percentage',
  parameters: calculateFeeParams,
  execute: async input => {
    return input.amount * (input.feePercent / 100);
  },
};
```

---

### 🔒 Stateful Tools with Context

A **stateful tool** accesses shared context that exists beyond the individual tool call. In v2, this is managed through **context providers** that supply type-safe, shared data to your tools.

**When to use stateful tools:**

- Tool needs configuration loaded at startup
- Tool requires shared resources (database connections, token mappings)
- Tool needs to access user preferences or session data
- Tool depends on data from external services (MCP servers)

**Example with Context Provider:**

```ts
// context/types.ts
export interface AgentContext {
  tokenMap: Record<string, { address: string; decimals: number }>;
  defaultChainId: number;
  apiEndpoints: {
    quicknode: string;
    rpc: string;
  };
  loadedAt: Date;
}
```

```ts
// context/provider.ts
import type { AgentContext } from './types.js';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

export async function contextProvider(deps: {
  mcpClients: Record<string, Client>;
}): Promise<AgentContext> {
  // Load token mapping from remote Ember MCP server
  const emberClient = deps.mcpClients['ember'];
  let tokenMap = {};

  if (emberClient) {
    const response = await emberClient.callTool({
      name: 'getTokens',
      arguments: { chainId: 42161 },
    });
    tokenMap = parseTokenResponse(response);
  }

  return {
    tokenMap,
    defaultChainId: 42161,
    apiEndpoints: {
      quicknode: process.env.QUICKNODE_URL!,
      rpc: process.env.RPC_URL!,
    },
    loadedAt: new Date(),
  };
}
```

#### **Connecting to Remote MCP Servers**

For remote MCP servers like Ember AI, you need to configure the connection transport. Here's how to connect to the remote Ember server:

```ts
// context/provider.ts
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/http.js';

// The framework automatically sets up MCP clients based on your skills
// For agents that need to access remote servers like Ember, ensure you have:
// - EMBER_ENDPOINT=@https://api.emberai.xyz/mcp in your environment variables
// - Skills that reference the remote MCP server

// The ember client will be available as deps.mcpClients['ember']
// when the framework initializes MCP clients for your skills
```

**Note:** The v2 framework automatically handles MCP client initialization when you define skills that reference external MCP servers. The transport configuration is managed internally based on your environment variables.

```ts
// tools/getTokenInfo.ts
import type { AgentContext } from '../context/types.js';
import type { VibkitToolDefinition } from 'arbitrum-vibekit-core';

const getTokenInfoParams = z.object({
  symbol: z.string(),
});

export const getTokenInfoTool: VibkitToolDefinition<typeof getTokenInfoParams, any, AgentContext> =
  {
    name: 'getTokenInfo',
    description: 'Get token information from the token map',
    parameters: getTokenInfoParams,
    execute: async (input, context) => {
      // Access shared context loaded at startup
      const tokenInfo = context.custom.tokenMap[input.symbol.toUpperCase()];

      if (!tokenInfo) {
        throw new VibkitError(
          'TokenNotFound',
          `Token ${input.symbol} not found in token map`,
          -32001
        );
      }

      return {
        symbol: input.symbol,
        address: tokenInfo.address,
        decimals: tokenInfo.decimals,
        chainId: context.custom.defaultChainId,
      };
    },
  };
```

---

### 🔌 Context in Skills

Skills can declare context requirements and pass context to their tools during LLM orchestration:

```ts
// skills/tokenOperations.ts
import { defineSkill } from 'arbitrum-vibekit-core';
import { getTokenInfoTool } from '../tools/getTokenInfo.js';

export const tokenOperationsSkill = defineSkill({
  id: 'token-operations',
  name: 'Token Operations',
  description: 'Get information about tokens and perform operations',
  tags: ['tokens', 'defi'],
  examples: ['Get info for USDC', 'What is the address of ETH?'],
  inputSchema: z.object({
    instruction: z.string(),
  }),
  tools: [getTokenInfoTool],
  // Context is automatically passed to tools during execution
});
```

---

### 📋 Design Guidelines

**Choose stateless when:**

- Pure computation or formatting
- No external dependencies needed
- Tool can be easily tested in isolation
- Performance and caching are priorities

**Choose stateful when:**

- Tool needs configuration or shared resources
- Tool depends on data loaded from MCP servers
- Tool requires coordination with external services
- Tool needs access to user session or preferences

**Best Practices:**

1. **Start stateless**: Build tools without context first when possible
2. **Minimal context**: Only include what tools actually need
3. **Type safety**: Use TypeScript interfaces for context
4. **Fail fast**: Validate required context at startup
5. **Document dependencies**: Make context requirements clear

---

### ✅ Summary

The v2 framework's context provider pattern gives you:

- **Type-safe state management** through context interfaces
- **Clear dependency injection** via context providers
- **Startup-time loading** of shared resources from MCP servers
- **Clean separation** between stateless computation and stateful coordination

By understanding when to use stateless vs stateful patterns, you can build tools that are both powerful and maintainable.

> "Stateless tools solve problems. Stateful tools coordinate solutions."

| Pattern              | Use Case         | Example                             |
| -------------------- | ---------------- | ----------------------------------- |
| **Stateless**        | Pure computation | Price formatting, fee calculation   |
| **Stateful**         | Shared resources | Token mapping, API configuration    |
| **Context Provider** | Startup loading  | MCP server data, environment config |
