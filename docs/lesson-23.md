---
title: "Blockchain Integration"
category: "advanced"
difficulty: "hard"
duration: "23 minutes"
prerequisites: ["lesson-22"]
next_lesson: "lesson-24"
framework_version: "3.0+ (Agent Node)"
last_updated: "2025-10-15"
tags: ["blockchain","web3","defi"]
---

# **Lesson 23: Workflow Tools and Design Patterns**

---

### 🔍 Overview

As agents grow more sophisticated, you'll encounter scenarios where multiple operations need to be coordinated together. **Workflow tools** encapsulate multi-step processes that always occur together, while design patterns help you structure skills for maximum effectiveness and maintainability.

Understanding when to use workflow tools versus individual tools, and how to structure skills around common patterns, is crucial for building agents that are both powerful and easy to understand.

This lesson covers the key design patterns used in production agents and when to apply each approach.

---

### 🔄 Workflow Tools vs Individual Tools

#### **Individual Tools Pattern**

Best for independent actions that users might want to perform separately:

```ts
// Good: Independent lending operations
const supplyParams = z.object({
  token: z.string(),
  amount: z.number(),
  walletAddress: z.string(),
});

export const supplyTool: VibkitToolDefinition<typeof supplyParams> = {
  name: 'supplyToken',
  description: 'Supply tokens to Aave lending pool',
  parameters: supplyParams,
  execute: async input => {
    // Just supply tokens
    return await aave.supply(input.token, input.amount, input.walletAddress);
  },
};

const borrowParams = z.object({
  token: z.string(),
  amount: z.number(),
  walletAddress: z.string(),
});

export const borrowTool: VibkitToolDefinition<typeof borrowParams> = {
  name: 'borrowToken',
  description: 'Borrow tokens from Aave lending pool',
  parameters: borrowParams,
  execute: async input => {
    // Just borrow tokens
    return await aave.borrow(input.token, input.amount, input.walletAddress);
  },
};

// LLM can coordinate: "Supply 100 USDC then borrow 50 ETH"
export const lendingSkill = defineSkill({
  id: 'lending-operations',
  tools: [supplyTool, borrowTool, repayTool, withdrawTool],
  // LLM orchestrates the sequence
});
```

#### **Workflow Tools Pattern**

Best for multi-step processes that always occur together:

```ts
// Good: Swap always requires quote → approve → execute
const swapWorkflowParams = z.object({
  fromToken: z.string(),
  toToken: z.string(),
  amount: z.number(),
  walletAddress: z.string(),
  slippage: z.number().default(0.5),
});

export const executeSwapWorkflow: VibkitToolDefinition<typeof swapWorkflowParams> = {
  name: 'executeSwapWorkflow',
  description: 'Complete token swap from quote to execution',
  parameters: swapWorkflowParams,
  execute: async input => {
    try {
      // Step 1: Get quote
      const quote = await dex.getQuote({
        fromToken: input.fromToken,
        toToken: input.toToken,
        amount: input.amount,
      });

      // Step 2: Check allowance and approve if needed
      const allowance = await token.getAllowance(
        input.fromToken,
        input.walletAddress,
        DEX_ROUTER_ADDRESS
      );

      if (allowance < input.amount) {
        await token.approve(input.fromToken, input.walletAddress, DEX_ROUTER_ADDRESS, input.amount);
      }

      // Step 3: Execute swap
      const swapResult = await dex.executeSwap({
        ...quote,
        slippage: input.slippage,
        walletAddress: input.walletAddress,
      });

      return {
        success: true,
        quote,
        swapResult,
        fromAmount: input.amount,
        toAmount: swapResult.outputAmount,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        step: 'Failed during workflow execution',
      };
    }
  },
};
```

---

### 📋 Common Design Patterns

#### **1. Single-Tool Skills (Focused Capability)**

For specialized capabilities that might expand later:

```ts
export const priceSkill = defineSkill({
  id: 'price-prediction',
  name: 'Price Prediction',
  description: 'Get AI-powered price predictions for tokens',
  tags: ['prediction', 'market-data'],
  examples: ['What will BTC price be?', 'Get ETH price prediction'],

  inputSchema: z.object({
    message: z.string().describe('Natural language price query'),
  }),

  tools: [getPricePredictionTool], // Single focused tool

  mcpServers: [
    {
      command: 'node',
      moduleName: '@alloralabs/mcp-server',
      env: { ALLORA_API_KEY: process.env.ALLORA_API_KEY },
    },
  ],
});
```

**When to use:**

- Single focused capability
- Might expand with more tools later
- Clear, specific user intent
- External service integration

#### **2. Multi-Tool Skills (Complex Operations)**

For comprehensive capabilities with multiple related operations:

```ts
export const portfolioSkill = defineSkill({
  id: 'portfolio-management',
  name: 'Portfolio Management',
  description: 'Comprehensive portfolio analysis and management',
  tags: ['portfolio', 'analysis', 'defi'],
  examples: [
    'What are my current holdings?',
    'Rebalance my portfolio to 60% ETH, 40% USDC',
    'Analyze my portfolio performance',
  ],

  inputSchema: z.object({
    instruction: z.string(),
    walletAddress: z.string(),
  }),

  tools: [
    getPortfolioBalancesTool, // "What do I own?"
    analyzePerformanceTool, // "How am I doing?"
    suggestRebalanceTool, // "How should I rebalance?"
    executeRebalanceWorkflow, // "Rebalance to target allocation"
    calculateRiskTool, // "What's my risk exposure?"
  ],

  // LLM coordinates based on user intent
});
```

**When to use:**

- Multiple related operations
- Complex user intents
- Needs intelligent routing
- Comprehensive capability area

#### **3. Workflow-Dominant Skills (Process-Oriented)**

For skills built around coordinated multi-step processes:

```ts
export const tradingSkill = defineSkill({
  id: 'advanced-trading',
  name: 'Advanced Trading',
  description: 'Execute complex trading strategies',
  tags: ['trading', 'strategy', 'defi'],
  examples: [
    'Execute market buy for 1000 USDC of ETH',
    'Place limit order: buy ETH at $3000',
    'Cancel order #123',
  ],

  tools: [
    // Workflows for complex operations
    executeMarketOrderWorkflow, // Market buy/sell with validation
    executeLimitOrderWorkflow, // Place and monitor limit orders
    executeDCAWorkflow, // Dollar cost averaging strategy

    // Simple tools for quick operations
    cancelOrderTool, // Cancel existing order
    getOrderStatusTool, // Check order status
    getOrderHistoryTool, // View past orders
  ],
});
```

**When to use:**

- Mix of complex workflows and simple operations
- Process-heavy domain (trading, DeFi strategies)
- Need both automation and manual control

#### **4. Utility Skills (Support Functions)**

For simple, deterministic operations that support other capabilities:

```ts
export const utilitySkill = defineSkill({
  id: 'utility-functions',
  name: 'Utility Functions',
  description: 'Helper functions for calculations and formatting',
  tags: ['utility', 'calculation'],
  examples: ['What time is it?', 'Calculate 15% of 1000', 'Format this timestamp'],

  tools: [getCurrentTimeTool, calculatePercentageTool, formatNumberTool, convertUnitsTool],

  // Often uses manual handlers for performance
  handler: async input => {
    // Route to appropriate utility function
    // Manual routing for deterministic operations
  },
});
```

**When to use:**

- Simple, deterministic operations
- Supporting other skills
- Performance-critical functions
- Pure computation

---

### 🎯 Design Decision Framework

#### **Tool Granularity Decision Tree**

```
Is this a multi-step process that ALWAYS happens together?
├─ YES → Workflow Tool
│   └─ Example: Quote → Approve → Swap
└─ NO → Individual Tools
    └─ Example: Supply, Borrow, Repay (can be done separately)

Do users need to perform steps independently?
├─ YES → Individual Tools + LLM Orchestration
└─ NO → Workflow Tool

Is the process deterministic with clear steps?
├─ YES → Workflow Tool
└─ NO → Individual Tools + LLM Coordination
```

#### **Skill Structure Decision Tree**

```
How many tools does this capability need?
├─ 1 Tool → Single-Tool Skill
├─ 2-4 Related Tools → Multi-Tool Skill
└─ 5+ Tools → Consider splitting into multiple skills

Are the tools tightly coupled?
├─ YES → Keep in same skill
└─ NO → Split into separate skills

Do the tools serve the same user intent?
├─ YES → Same skill
└─ NO → Separate skills
```

---

### 🔧 Implementation Examples

#### **Hook-Enhanced Workflow**

Combine workflows with hooks for maximum flexibility:

```ts
// tools/executeSwapWorkflow.ts
const swapSchema = z.object({
  fromToken: z.string(),
  toToken: z.string(),
  amount: z.number(),
});

export const executeSwapWorkflow: VibkitToolDefinition<typeof swapSchema> = {
  name: 'executeSwapWorkflow',
  description: 'Execute token swap with validation and confirmation',
  parameters: swapSchema,
  execute: async input => {
    // Core workflow logic
    return await performSwap(input);
  },
};

// hooks/swapHooks.ts
export const beforeHooks = {
  executeSwapWorkflow: async context => {
    // Pre-validation
    await validateSwapParameters(context.input);
    await checkTokenBalances(context.input);
    await verifySlippageLimits(context.input);
  },
};

export const afterHooks = {
  executeSwapWorkflow: async context => {
    // Post-processing
    await logSwapTransaction(context.result);
    await updatePortfolioCache(context.input.walletAddress);
    await notifyUser(context.result);
  },
};
```

#### **Conditional Workflows**

Workflows that adapt based on conditions:

```ts
const rebalanceParams = z.object({
  walletAddress: z.string(),
  targetAllocation: z.record(z.number()),
  maxSlippage: z.number().default(1.0),
});

export const smartRebalanceWorkflow: VibkitToolDefinition<typeof rebalanceParams> = {
  name: 'smartRebalanceWorkflow',
  description: 'Intelligently rebalance portfolio based on current state',
  parameters: rebalanceParams,
  execute: async input => {
    // Step 1: Analyze current portfolio
    const currentBalances = await getPortfolioBalances(input.walletAddress);
    const analysis = await analyzeRebalanceNeeds(currentBalances, input.targetAllocation);

    if (!analysis.needsRebalancing) {
      return {
        success: true,
        action: 'no_rebalancing_needed',
        message: 'Portfolio is already within target allocation',
        currentAllocation: analysis.currentAllocation,
      };
    }

    // Step 2: Plan trades
    const tradePlan = await calculateRequiredTrades(analysis);

    if (tradePlan.estimatedSlippage > input.maxSlippage) {
      return {
        success: false,
        action: 'slippage_too_high',
        message: `Estimated slippage ${tradePlan.estimatedSlippage}% exceeds limit ${input.maxSlippage}%`,
        tradePlan,
      };
    }

    // Step 3: Execute trades
    const results = [];
    for (const trade of tradePlan.trades) {
      const result = await executeSwap(trade);
      results.push(result);

      if (!result.success) {
        // Stop on first failure
        return {
          success: false,
          action: 'trade_failed',
          message: `Trade failed: ${result.error}`,
          completedTrades: results,
        };
      }
    }

    return {
      success: true,
      action: 'rebalanced',
      message: 'Portfolio successfully rebalanced',
      completedTrades: results,
      newAllocation: await getCurrentAllocation(input.walletAddress),
    };
  },
};
```

---

### 🎨 Advanced Patterns

#### **Skill Composition**

Building complex capabilities from simpler skills:

```ts
// Simple skills
export const swapSkill = defineSkill({
  id: 'token-swap',
  tools: [executeSwapWorkflow],
});

export const lendingSkill = defineSkill({
  id: 'lending',
  tools: [supplyTool, borrowTool],
});

// Composed skill that uses other skills
export const yieldFarmingSkill = defineSkill({
  id: 'yield-farming',
  name: 'Yield Farming',
  description: 'Automated yield farming strategies',
  tools: [
    // Workflow that coordinates swap + lending
    executeYieldFarmWorkflow,
  ],

  // Can reference other skills' tools if needed
  // Or delegate to other agents via A2A
});
```

#### **Error Recovery Workflows**

Workflows that handle failures gracefully:

```ts
const robustSwapParams = z.object({
  fromToken: z.string(),
  toToken: z.string(),
  amount: z.number(),
});

export const robustSwapWorkflow: VibkitToolDefinition<typeof robustSwapParams> = {
  name: 'robustSwapWorkflow',
  description: 'Execute swap with automatic retry and fallback',
  parameters: robustSwapParams,
  execute: async input => {
    const maxRetries = 3;
    const fallbackDexes = ['uniswap', 'sushiswap', 'curve'];

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      for (const dex of fallbackDexes) {
        try {
          const result = await executeSwapOnDex(input, dex);
          return {
            success: true,
            result,
            dexUsed: dex,
            attempt: attempt + 1,
          };
        } catch (error) {
          console.warn(`Swap failed on ${dex}, attempt ${attempt + 1}:`, error.message);

          if (dex === fallbackDexes[fallbackDexes.length - 1] && attempt === maxRetries - 1) {
            // Last attempt on last DEX
            return {
              success: false,
              error: 'All swap attempts failed',
              attempts: maxRetries,
              dexesTried: fallbackDexes,
              lastError: error.message,
            };
          }
        }
      }
    }
  },
};
```

---

### ✅ Summary

Effective workflow and skill design requires understanding the trade-offs:

- **Workflow tools** encapsulate multi-step processes that always occur together
- **Individual tools** provide flexibility for independent operations
- **LLM orchestration** handles coordination between individual tools
- **Design patterns** provide proven structures for common scenarios
- **Mixed approaches** optimize each capability for its specific needs

Choose workflow tools for coupled processes, individual tools for independent operations, and let LLM orchestration handle the coordination between them.

> "Good design makes common things easy and complex things possible."

| Pattern                | Use Case             | Benefits                    | Trade-offs            |
| ---------------------- | -------------------- | --------------------------- | --------------------- |
| **Workflow Tools**     | Coupled processes    | Reliability, atomicity      | Less flexibility      |
| **Individual Tools**   | Independent actions  | Flexibility, composability  | Requires coordination |
| **Single-Tool Skills** | Focused capabilities | Simple, clear               | Limited scope         |
| **Multi-Tool Skills**  | Complex domains      | Comprehensive               | More complex          |
| **Utility Skills**     | Support functions    | Performance, predictability | Limited intelligence  |
