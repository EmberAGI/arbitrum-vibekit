---
title: "Agent Communication Protocols"
category: "advanced"
difficulty: "hard"
duration: "23 minutes"
prerequisites: ["lesson-19"]
next_lesson: "lesson-21"
framework_version: "3.0+ (Agent Node)"
last_updated: "2025-10-15"
tags: ["communication","protocols","a2a"]
---

# **Lesson 20: Skills - The v2 Foundation**

---

### 🔍 Overview

**Skills** are the cornerstone of the v2 framework. They define what your agent can do and serve as the public interface that other agents, LLMs, and users interact with. Each skill represents a cohesive capability (like "lending operations" or "price prediction") and groups related tools under intelligent LLM orchestration.

Understanding skills is essential because they fundamentally changed how agents are architected in v2. Instead of exposing individual tools directly, you expose skills that intelligently coordinate multiple tools to accomplish user goals.

---

### 🎯 What Makes a Skill

A skill is defined using `defineSkill()` and contains:

- **Metadata**: ID, name, description that identify the capability
- **Interface**: Input schema, tags, and examples for discovery
- **Implementation**: Tools that perform the actual work
- **Dependencies**: MCP servers needed for external data/services
- **Orchestration**: LLM routing (default) or manual handler (optional)

```ts
// skills/greeting.ts
import { defineSkill } from 'arbitrum-vibekit-core';
import { getFormalGreetingTool, getCasualGreetingTool } from '../tools/index.js';

export const greetingSkill = defineSkill({
  // Skill identity
  id: 'greeting-skill',
  name: 'Greeting Generator',
  description: 'Generate personalized greetings in different styles',

  // Discovery metadata (required)
  tags: ['greeting', 'personalization'],
  examples: ['Greet Alice formally', 'Say hello to Bob casually'],

  // Interface definition
  inputSchema: z.object({
    name: z.string(),
    style: z.enum(['formal', 'casual']),
  }),

  // Implementation
  tools: [getFormalGreetingTool, getCasualGreetingTool],

  // External dependencies
  mcpServers: [
    {
      command: 'tsx',
      moduleName: './mock-servers/translation.ts',
      env: { API_KEY: process.env.TRANSLATE_API_KEY },
    },
  ],

  // Orchestration: LLM routing (default) or manual handler
  // No handler = LLM orchestration
});
```

---

### 🧠 LLM Orchestration (Default)

When you don't provide a `handler`, the skill uses **LLM orchestration**. The LLM acts as an intelligent router that:

1. **Analyzes** user input to understand intent
2. **Routes** to appropriate tools based on context
3. **Coordinates** multi-tool workflows when needed
4. **Aggregates** results into coherent responses

```ts
// User: "Give me a formal greeting for Sarah"
// LLM orchestration:
// 1. Analyzes: user wants formal style, name is Sarah
// 2. Routes to: getFormalGreetingTool
// 3. Calls: getFormalGreetingTool({ name: "Sarah" })
// 4. Returns: "Good day, Sarah. I hope you are well."

export const smartGreetingSkill = defineSkill({
  id: 'smart-greeting',
  name: 'Smart Greeting',
  description: 'Intelligently generate greetings based on context',
  tags: ['greeting', 'smart'],
  examples: ['Greet John professionally', 'Say hi to Alice in Spanish'],

  inputSchema: z.object({
    instruction: z.string().describe('Natural language greeting request'),
  }),

  tools: [
    getFormalGreetingTool,
    getCasualGreetingTool,
    getLocalizedGreetingTool,
    getTimeAwareGreetingTool,
  ],

  // No handler = LLM orchestration handles routing
});
```

---

### ⚙️ Manual Handlers (Optional)

For simple, deterministic operations, you can provide a manual `handler` that bypasses LLM orchestration:

```ts
export const timeSkill = defineSkill({
  id: 'get-time',
  name: 'Time Service',
  description: 'Get current time in various formats',
  tags: ['utility', 'time'],
  examples: ['What time is it?', 'Get current timestamp'],

  inputSchema: z.object({
    format: z.enum(['iso', 'unix', 'human']).default('iso'),
  }),

  tools: [getTimeTool], // Required even with manual handler

  // Manual handler - bypasses LLM
  handler: async input => {
    const now = new Date();

    switch (input.format) {
      case 'unix':
        return createSuccessTask(
          'get-time',
          undefined,
          Math.floor(now.getTime() / 1000).toString()
        );
      case 'human':
        return createSuccessTask('get-time', undefined, now.toLocaleString());
      case 'iso':
      default:
        return createSuccessTask('get-time', undefined, now.toISOString());
    }
  },
});
```

---

### 🔗 Skills vs Tools Relationship

- **Skills** = Public interface (what users/agents see)
- **Tools** = Internal implementation (how work gets done)

```ts
// PUBLIC: Other agents call this skill
export const lendingSkill = defineSkill({
  id: 'lending-operations',
  name: 'Lending Operations',
  description: 'Perform lending operations on Aave protocol',
  tags: ['defi', 'lending'],
  examples: ['Supply 100 USDC', 'Borrow 50 ETH'],

  inputSchema: z.object({
    instruction: z.string(),
    walletAddress: z.string(),
  }),

  // PRIVATE: Internal tools that implement the capability
  tools: [supplyTool, borrowTool, repayTool, withdrawTool],
});
```

This separation allows you to:

- **Refactor tools** without changing the public interface
- **Add new tools** to expand capability
- **Change implementation** while maintaining compatibility
- **Hide complexity** from users

---

### 📋 Skill Design Patterns

#### **Single-Tool Skills**

For focused capabilities that might expand later:

```ts
export const swapSkill = defineSkill({
  id: 'token-swap',
  name: 'Token Swap',
  description: 'Swap tokens on DEX',
  tools: [executeSwapWorkflow], // One tool now, easy to add more
});
```

#### **Multi-Tool Skills**

For complex capabilities with multiple operations:

```ts
export const portfolioSkill = defineSkill({
  id: 'portfolio-management',
  name: 'Portfolio Management',
  description: 'Manage your crypto portfolio',
  tools: [getBalancesTool, rebalancePortfolioTool, analyzePerformanceTool, setAllocationTool],
});
```

#### **Workflow Skills**

For coordinated multi-step processes:

```ts
export const tradingSkill = defineSkill({
  id: 'advanced-trading',
  name: 'Advanced Trading',
  tools: [
    executeMarketOrderWorkflow, // Multi-step: validate → execute → confirm
    executeLimitOrderWorkflow, // Multi-step: place → monitor → execute
    cancelOrder, // Single action
    getOrderStatus, // Single action
  ],
});
```

---

### 🏗️ Required Skill Metadata

Every skill **must** have:

```ts
export const mySkill = defineSkill({
  // Core identity
  id: 'unique-skill-id',           // Required: unique identifier
  name: 'Human Readable Name',     // Required: display name
  description: 'What this does',   // Required: clear capability description

  // Discovery (required)
  tags: ['tag1', 'tag2'],         // Required: minimum 1 tag
  examples: ['Example 1'],         // Required: minimum 1 example

  // Interface
  inputSchema: z.object({...}),    // Required: input validation

  // Implementation
  tools: [tool1, tool2],          // Required: minimum 1 tool

  // Optional
  mcpServers: [...],              // External dependencies
  handler: async (input) => {...} // Manual override
});
```

---

### ✅ Summary

Skills are the foundation of v2 architecture:

- **Skills define capabilities** - what your agent can do
- **Tools implement functionality** - how capabilities work
- **LLM orchestration** handles intelligent routing between tools
- **Manual handlers** bypass LLM for simple operations
- **Required metadata** makes skills discoverable and usable

By organizing your agent around skills rather than individual tools, you create a more maintainable, discoverable, and powerful architecture.

> "Skills are promises. Tools are implementations."

| Decision                                   | Rationale                                                             |
| ------------------------------------------ | --------------------------------------------------------------------- |
| **Skills as primary abstraction**          | Creates clear public interface while hiding implementation complexity |
| **Required metadata (tags, examples)**     | Ensures all skills are discoverable and provide usage guidance        |
| **LLM orchestration by default**           | Leverages AI for intelligent routing without requiring manual logic   |
| **Tools always required**                  | Maintains consistency even when using manual handlers                 |
| **Separation of interface/implementation** | Allows refactoring tools without breaking public contracts            |
