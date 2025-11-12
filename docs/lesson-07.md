---
title: "Advanced Agent Configuration"
category: "intermediate"
difficulty: "intermediate"
duration: "15 minutes"
prerequisites: ["lesson-06"]
next_lesson: "lesson-08"
framework_version: "3.0+ (Agent Node)"
last_updated: "2025-10-15"
tags: ["configuration","advanced","customization"]
---

# **Lesson 7: v2 Agent Structure and File Layout**

---

### 📂 Overview

The v2 framework introduces a clean, modular architecture centered around **skills** as the primary abstraction. This lesson explains the folder structure used in template agents and how each component fits together to create powerful, maintainable AI agents.

The v2 structure prioritizes clarity, type safety, and separation of concerns—making it easy for developers to understand, extend, and maintain their agents.

---

### 📁 Template Agent Structure

_The standard folder layout used by all v2 template agents._

```plaintext
agent-name/
├── src/
│   ├── index.ts          # Agent entry point and MCP server setup
│   ├── skills/           # Skill definitions (high-level capabilities)
│   │   ├── lending.ts    # Example: lending skill with multiple tools
│   │   ├── trading.ts    # Example: trading skill
│   │   └── analytics.ts  # Example: analytics skill
│   ├── tools/            # Tool implementations (actions)
│   │   ├── supply.ts     # Example: supply tool
│   │   ├── borrow.ts     # Example: borrow tool
│   │   └── swap.ts       # Example: swap workflow tool
│   ├── hooks/            # Tool enhancement hooks (optional)
│   │   └── index.ts      # Before/after hooks for tools
│   └── context/          # Shared context and types (optional)
│       ├── provider.ts   # Context provider
│       └── types.ts      # Type definitions
├── test/                 # Test files
├── package.json          # Agent dependencies
├── tsconfig.json         # TypeScript configuration
└── README.md            # Agent documentation
```

---

### 🛠️ Directory Roles

#### **src/skills/** - High-Level Capabilities

Skills define what your agent can do. Each skill groups related tools and handles LLM orchestration.

```ts
// skills/greeting.ts
import { defineSkill } from 'arbitrum-vibekit-core';
import { getFormalGreetingTool, getCasualGreetingTool } from '../tools/index.js';

export const greetingSkill = defineSkill({
  id: 'greeting-skill',
  name: 'Greeting Generator',
  description: 'Generate personalized greetings in different styles',
  tags: ['greeting', 'personalization'],
  examples: ['Greet Alice formally', 'Say hello to Bob casually'],
  inputSchema: z.object({
    name: z.string(),
    style: z.enum(['formal', 'casual']),
  }),
  tools: [getFormalGreetingTool, getCasualGreetingTool],
  mcpServers: [
    /* external MCP servers */
  ],
  // LLM orchestration handles tool routing automatically
});
```

#### **src/tools/** - Implementation Logic

Tools contain the actual business logic. They're internal to skills and handle specific operations.

```ts
// tools/getFormalGreeting.ts
import { z } from 'zod';
import type { VibkitToolDefinition } from 'arbitrum-vibekit-core';

const formalGreetingParams = z.object({
  name: z.string(),
});

export const getFormalGreetingTool: VibkitToolDefinition<typeof formalGreetingParams> = {
  name: 'getFormalGreeting',
  description: 'Generate a formal greeting',
  parameters: formalGreetingParams,
  execute: async input => {
    return `Good day, ${input.name}. I hope you are well.`;
  },
};
```

#### **src/hooks/** - Tool Enhancement (Optional)

Hooks run before or after tool execution to add cross-cutting concerns like logging, validation, or formatting.

```ts
// hooks/index.ts
import type { ToolContext } from 'arbitrum-vibekit-core';

export const beforeHooks = {
  // Runs before any tool in the getPricePrediction family
  getPricePrediction: async (context: ToolContext) => {
    console.log(`[Hook] Getting price prediction for:`, context.input);
    // Modify context.input if needed
  },
};

export const afterHooks = {
  getPricePrediction: async (context: ToolContext) => {
    // Format the response with emojis and structure
    if (context.result && typeof context.result === 'object') {
      context.result = {
        ...context.result,
        formatted: `📈 Price prediction: ${context.result.prediction}`,
      };
    }
  },
};
```

#### **src/context/** - Shared State (Optional)

Context provides type-safe shared state loaded at startup, typically from MCP servers or environment variables.

```ts
// context/types.ts
export interface AgentContext {
  tokenMap: Record<string, { address: string; decimals: number }>;
  apiEndpoints: {
    quicknode: string;
    ember: string;
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
  // Load shared data from MCP servers at startup
  const emberClient = deps.mcpClients['ember'];
  const tokenMap = await loadTokenMapFromMcp(emberClient);

  return {
    tokenMap,
    apiEndpoints: {
      quicknode: process.env.QUICKNODE_URL!,
      ember: process.env.EMBER_ENDPOINT!,
    },
    loadedAt: new Date(),
  };
}
```

#### **src/index.ts** - Agent Entry Point

The main entry point sets up the agent configuration and starts the MCP server.

```ts
// index.ts
import { Agent, type AgentConfig } from 'arbitrum-vibekit-core';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { greetingSkill } from './skills/greeting.js';
import { contextProvider } from './context/provider.js';

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

export const agentConfig: AgentConfig = {
  name: 'My Agent',
  version: '1.0.0',
  description: 'A helpful AI agent',
  skills: [greetingSkill],
  url: 'localhost',
  capabilities: {
    streaming: false,
    pushNotifications: false,
    stateTransitionHistory: false,
  },
  defaultInputModes: ['application/json'],
  defaultOutputModes: ['application/json'],
};

const agent = Agent.create(agentConfig, {
  cors: true,
  llm: { model: openrouter('google/gemini-2.0-flash-001') },
});

await agent.start(3000, contextProvider);
```

---

### 🏗️ Architecture Principles

#### **Skills as Public Interface**

- **Skills** are what other agents and users see
- Each skill represents a cohesive capability
- Skills use LLM orchestration to route between tools
- Skills declare their MCP server dependencies

#### **Tools as Internal Implementation**

- **Tools** are internal implementation details
- Tools contain the actual business logic
- Tools can be shared between skills
- Tools access context for shared resources

#### **LLM Orchestration First**

- Skills default to LLM orchestration (no manual handler)
- LLM intelligently routes user requests to appropriate tools
- Manual handlers only for simple, deterministic operations
- Supports multi-tool workflows and conditional logic

#### **Type Safety Throughout**

- Context providers ensure type-safe shared state
- Zod schemas validate all inputs
- TypeScript interfaces for all data structures
- Compile-time checking prevents runtime errors

---

### 📋 Design Patterns

#### **Single-Tool Skills**

For focused capabilities that might expand later:

```ts
export const tokenSwapSkill = defineSkill({
  id: 'token-swap',
  name: 'Token Swap',
  description: 'Swap tokens on DEX',
  tools: [executeSwapWorkflow], // Easy to add more tools later
});
```

#### **Multi-Tool Skills**

For complex capabilities with multiple related operations:

```ts
export const lendingSkill = defineSkill({
  id: 'lending-operations',
  name: 'Lending Operations',
  description: 'Perform lending operations on Aave protocol',
  tools: [supplyTool, borrowTool, repayTool, withdrawTool],
});
```

#### **Workflow Tools**

For multi-step processes that always occur together:

```ts
// tools/executeSwapWorkflow.ts
const swapWorkflowParams = z.object({
  fromToken: z.string(),
  toToken: z.string(),
  amount: z.number(),
});

export const executeSwapWorkflow: VibkitToolDefinition<typeof swapWorkflowParams> = {
  name: 'executeSwapWorkflow',
  description: 'Complete token swap workflow',
  parameters: swapWorkflowParams,
  execute: async input => {
    // Encapsulates: quote → approve → execute → confirm
    const quote = await getQuote(input);
    await approveToken(input, quote);
    const result = await executeSwap(input, quote);
    return result;
  },
};
```

---

### ✅ Summary

The v2 folder structure provides:

- **Clear separation of concerns** between skills, tools, hooks, and context
- **LLM-first architecture** with intelligent orchestration
- **Type-safe state management** through context providers
- **Modular design** that's easy to understand and extend
- **Standardized patterns** across all template agents

This structure scales from simple single-skill agents to complex multi-capability systems while maintaining clarity and maintainability.

> "Good architecture makes the right thing easy and the wrong thing hard."

| Component   | Purpose                | When to Use                                    |
| ----------- | ---------------------- | ---------------------------------------------- |
| **Skills**  | Public capabilities    | Always - the primary abstraction               |
| **Tools**   | Implementation logic   | Always - at least one per skill                |
| **Hooks**   | Cross-cutting concerns | Optional - for logging, formatting, validation |
| **Context** | Shared state           | Optional - when tools need shared resources    |
