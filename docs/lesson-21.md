---
title: "Advanced Workflow Patterns"
category: "advanced"
difficulty: "hard"
duration: "23 minutes"
prerequisites: ["lesson-20"]
next_lesson: "lesson-22"
framework_version: "3.0+ (Agent Node)"
last_updated: "2025-10-15"
tags: ["workflows","patterns","advanced"]
---

# **Lesson 21: LLM Orchestration vs Manual Handlers**

---

### 🔍 Overview

One of the most important architectural decisions in v2 is choosing between **LLM orchestration** and **manual handlers** for your skills. This choice fundamentally affects how your agent processes user requests and coordinates between tools.

**LLM orchestration** (the default) lets the LLM intelligently route user requests to appropriate tools and handle complex workflows. **Manual handlers** bypass the LLM entirely for deterministic, simple operations where you want complete control.

Understanding when to use each approach is crucial for building effective agents that balance AI intelligence with predictable behavior.

---

### 🧠 LLM Orchestration (Default & Recommended)

When you define a skill without a `handler`, the framework uses **LLM orchestration**. The LLM becomes your intelligent coordinator:

```ts
export const lendingSkill = defineSkill({
  id: 'lending-operations',
  name: 'Lending Operations',
  description: 'Perform lending operations on Aave protocol',
  tags: ['defi', 'lending'],
  examples: ['Supply 100 USDC', 'Borrow 50 ETH', 'What is my debt?'],

  inputSchema: z.object({
    instruction: z.string().describe('Natural language lending request'),
    walletAddress: z.string(),
  }),

  tools: [supplyTool, borrowTool, repayTool, withdrawTool, getBalancesTool],

  // No handler = LLM orchestration
});
```

#### **How LLM Orchestration Works**

1. **Intent Analysis**: LLM analyzes natural language input
2. **Tool Selection**: Chooses appropriate tool(s) based on intent
3. **Parameter Extraction**: Extracts and validates tool parameters
4. **Execution**: Calls tool(s) with proper arguments
5. **Result Processing**: Formats and returns coherent response

```ts
// User: "I want to supply 100 USDC and then borrow 50 ETH"
// LLM orchestration:
// 1. Analyzes: Two operations - supply USDC, then borrow ETH
// 2. Routes: First to supplyTool, then to borrowTool
// 3. Executes: supplyTool({ token: "USDC", amount: 100, ... })
// 4. Then: borrowTool({ token: "ETH", amount: 50, ... })
// 5. Returns: "Successfully supplied 100 USDC and borrowed 50 ETH"
```

#### **LLM Orchestration Benefits**

- ✅ **Natural Language Processing**: Handles varied user input gracefully
- ✅ **Multi-Tool Workflows**: Coordinates complex operations automatically
- ✅ **Context Awareness**: Understands relationships between operations
- ✅ **Error Recovery**: Can adapt when tools fail or need clarification
- ✅ **Future-Proof**: Adding new tools extends capability automatically

---

### ⚙️ Manual Handlers (Explicit Control)

For simple, deterministic operations, you can provide a manual `handler` that bypasses LLM orchestration:

```ts
export const timeSkill = defineSkill({
  id: 'get-time',
  name: 'Get Current Time',
  description: 'Get the current time in specified format',
  tags: ['utility', 'time'],
  examples: ['What time is it?', 'Get current timestamp'],

  inputSchema: z.object({
    format: z.enum(['iso', 'unix', 'human']).default('iso'),
    timezone: z.string().optional(),
  }),

  tools: [getTimeTool], // Still required for consistency

  // Manual handler - bypasses LLM completely
  handler: async input => {
    const now = new Date();
    let result;

    switch (input.format) {
      case 'unix':
        result = {
          timestamp: Math.floor(now.getTime() / 1000),
          format: 'unix',
        };
        break;
      case 'human':
        result = {
          timestamp: now.toLocaleString('en-US', {
            timeZone: input.timezone || 'UTC',
          }),
          format: 'human',
        };
        break;
      case 'iso':
      default:
        result = {
          timestamp: now.toISOString(),
          format: 'iso',
        };
    }

    return createSuccessTask('get-time', result);
  },
});
```

#### **Manual Handler Benefits**

- ✅ **Predictable Behavior**: Always executes exactly as programmed
- ✅ **Performance**: No LLM latency or cost
- ✅ **Deterministic**: Same input always produces same output
- ✅ **Simple Logic**: Straightforward control flow
- ✅ **Edge Case Handling**: You control all error scenarios

---

### 🤔 When to Choose Each Approach

#### **Use LLM Orchestration When:**

- **Multiple tools** need coordination
- **Natural language** input is important
- **Complex workflows** with conditional logic
- **User intent** varies significantly
- **Tools relationship** changes based on context

```ts
// Perfect for LLM orchestration
export const portfolioSkill = defineSkill({
  id: 'portfolio-management',
  inputSchema: z.object({
    instruction: z.string(), // "Rebalance my portfolio to 60% ETH, 40% USDC"
  }),
  tools: [getBalancesTool, calculateRebalanceTool, executeSwapTool, analyzeRiskTool],
  // LLM coordinates: get balances → calculate needed swaps → execute trades
});
```

#### **Use Manual Handlers When:**

- **Simple, deterministic** operations
- **Performance** is critical
- **Complete control** over logic flow is needed
- **No coordination** between tools required
- **Predefined input/output** mapping

```ts
// Perfect for manual handler
export const calculatorSkill = defineSkill({
  id: 'calculator',
  name: 'Calculator',
  description: 'Perform mathematical calculations',
  tags: ['utility', 'math'],
  examples: ['Calculate 2 + 2 * 3'],
  inputSchema: z.object({
    expression: z.string(), // "2 + 2 * 3"
  }),
  tools: [calculateTool],
  handler: async input => {
    // Simple, deterministic calculation
    const result = evaluateExpression(input.expression);
    return createSuccessTask('calculate', { result, expression: input.expression });
  },
});
```

---

### 🔄 Hybrid Patterns

You can also mix approaches for different skills in the same agent:

```ts
export const agentConfig: AgentConfig = {
  name: 'Multi-Modal Agent',
  skills: [
    // LLM orchestration for complex operations
    lendingSkill, // "Supply ETH and borrow USDC"
    portfolioSkill, // "Rebalance my portfolio optimally"

    // Manual handlers for simple operations
    timeSkill, // "What time is it?"
    calculatorSkill, // "Calculate 15% of 1000"
    echoSkill, // "Echo this message"
  ],
};
```

---

### 📊 Decision Framework

| Factor                   | LLM Orchestration                 | Manual Handler                |
| ------------------------ | --------------------------------- | ----------------------------- |
| **Input Complexity**     | Natural language, varied requests | Structured, predictable input |
| **Tool Coordination**    | Multiple tools, workflows         | Single operation              |
| **Performance**          | Acceptable latency                | Critical performance          |
| **Predictability**       | Flexible, adaptive                | Deterministic required        |
| **Future Extensibility** | Easy to add tools                 | Manual code changes           |

#### **Quick Decision Tree**

```
Does the skill need to coordinate multiple tools?
├─ YES → LLM Orchestration
└─ NO → Is the operation simple and deterministic?
   ├─ YES → Manual Handler
   └─ NO → LLM Orchestration (for flexibility)
```

---

### 🎯 Best Practices

#### **For LLM Orchestration:**

1. **Clear tool descriptions** - Help LLM understand when to use each tool
2. **Good examples** - Provide diverse use cases in skill metadata
3. **Descriptive schemas** - Use Zod descriptions for better parameter extraction
4. **Error handling** - Let tools return clear error messages

```ts
// Good: Clear, specific descriptions
const supplyTokenParams = z.object({
  token: z.string().describe('Token symbol like USDC, ETH'),
  amount: z.number().describe('Amount to supply'),
});

export const supplyTokenTool: VibkitToolDefinition<typeof supplyTokenParams> = {
  name: 'supplyToken',
  description: 'Supply tokens to Aave lending pool to earn interest',
  parameters: supplyTokenParams,
  execute: async (args, context) => {
    // Implementation
    return await aave.supply(args.token, args.amount);
  },
};

// Use in skill
tools: [supplyTokenTool];
```

#### **For Manual Handlers:**

1. **Simple input schemas** - Avoid natural language fields
2. **Comprehensive validation** - Handle all edge cases explicitly
3. **Clear return types** - Return structured, typed responses
4. **Error boundaries** - Catch and format all exceptions

```ts
handler: async (input) => {
  try {
    // Validate business logic
    if (input.amount <= 0) {
      throw new VibkitError('InvalidAmount', 'Amount must be positive');
    }

    // Execute deterministic logic
    const result = performCalculation(input);

    // Return structured response
    return createSuccessTask('calculation', {
      success: true,
      result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return createErrorTask('calculation', error.message, {
      timestamp: new Date().toISOString(),
    });
  }
},
```

---

### ✅ Summary

The choice between LLM orchestration and manual handlers shapes your agent's behavior:

- **LLM orchestration** provides intelligence, flexibility, and natural language handling
- **Manual handlers** provide control, performance, and predictability
- **Most skills** should use LLM orchestration for maximum capability
- **Simple operations** benefit from manual handlers for reliability
- **Hybrid approaches** let you optimize each skill individually

Start with LLM orchestration by default, and reach for manual handlers only when you need deterministic control or critical performance.

> "Let the LLM coordinate complexity. Take control for simplicity."

| Decision                                 | Rationale                                                                  |
| ---------------------------------------- | -------------------------------------------------------------------------- |
| **LLM orchestration as default**         | Maximizes agent capability and handles varied user input gracefully        |
| **Tools required even with handlers**    | Maintains consistent architecture and enables future migration             |
| **Clear decision criteria**              | Prevents over-engineering simple operations or under-powering complex ones |
| **Hybrid approach encouraged**           | Lets you optimize each skill for its specific requirements                 |
| **Performance vs flexibility trade-off** | Explicit choice based on use case requirements                             |
