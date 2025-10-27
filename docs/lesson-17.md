---
title: "Monitoring and Observability"
category: "advanced"
difficulty: "hard"
duration: "19 minutes"
prerequisites: ["lesson-16"]
next_lesson: "lesson-18"
framework_version: "3.0+ (Agent Node)"
last_updated: "2025-10-15"
tags: ["monitoring","observability","logging"]
---

# **Lesson 17: Validations and Tool Enhancement with Hooks**

---

### 🔍 Overview

The v2 framework provides powerful hook-based patterns for tool enhancement, validation, and cross-cutting concerns. Understanding how to use `withHooks`, before/after hooks, and validation patterns is essential for building robust, production-ready agents.

Hooks allow you to add validation, logging, metrics collection, and response formatting without cluttering your core business logic. This lesson covers the hook patterns actively used in v2 templates and production agents.

---

### 🪝 Hook-Based Tool Enhancement

The v2 framework uses `withHooks` to enhance tools with before/after hooks:

```ts
// Enhanced tool with validation and response formatting
export const supplyTool = withHooks(baseSupplyTool, {
  before: [tokenResolutionHook, balanceCheckHook],
  after: [responseParserHook, metricsHook],
});
```

### 🎯 Before Hooks for Validation

Before hooks run validation and transformation logic before tool execution:

```ts
// Token resolution hook from lending-agent
export async function tokenResolutionHook<Args extends TokenResolutionHookArgs>(
  args: Args,
  context: AgentContext<LendingAgentContext, any>
): Promise<(Args & { resolvedToken: TokenInfo }) | Task | Message> {
  const { tokenName } = args;
  const findResult = findTokenInfo(context.custom.tokenMap, tokenName);

  switch (findResult.type) {
    case 'notFound':
      return {
        id: createTaskId(),
        kind: 'task' as const,
        status: {
          state: TaskState.Failed,
          message: {
            role: 'agent',
            parts: [{ type: 'text', text: `Token '${tokenName}' not supported.` }],
          },
        },
      } as Task;

    case 'clarificationNeeded':
      const optionsText = findResult.options
        .map(opt => `- ${tokenName} on chain ${opt.chainId}`)
        .join('\n');
      return {
        id: createTaskId(),
        kind: 'task' as const,
        status: {
          state: TaskState.InputRequired,
          message: {
            role: 'agent',
            parts: [
              {
                type: 'text',
                text: `Which ${tokenName} do you want to use?\n${optionsText}`,
              },
            ],
          },
        },
      } as Task;

    case 'found':
      return { ...args, resolvedToken: findResult.token };
  }
}
```

### 🔍 Balance and Permission Validation

Before hooks can validate external conditions like wallet balances:

```ts
// Balance check hook from lending-agent
export async function balanceCheckHook<Args extends BalanceCheckHookArgs>(
  args: Args,
  context: AgentContext<LendingAgentContext, any>
): Promise<Args | Task> {
  const { resolvedToken, amount } = args;
  const walletAddress = context.skillInput?.walletAddress;

  if (!walletAddress) {
    return {
      id: createTaskId(),
      kind: 'task' as const,
      status: {
        state: TaskState.Failed,
        message: {
          role: 'agent',
          parts: [{ type: 'text', text: 'Wallet address is required.' }],
        },
      },
    } as Task;
  }

  try {
    const balance = await checkTokenBalance(
      walletAddress,
      resolvedToken.address,
      context.custom.rpcProvider
    );

    if (balance < parseFloat(amount)) {
      return {
        id: createTaskId(),
        kind: 'task' as const,
        status: {
          state: TaskState.Failed,
          message: {
            role: 'agent',
            parts: [
              {
                type: 'text',
                text: `Insufficient balance. You have ${balance} ${resolvedToken.symbol}, but need ${amount}.`,
              },
            ],
          },
        },
      } as Task;
    }

    return args; // Validation passed
  } catch (error) {
    return {
      id: createTaskId(),
      kind: 'task' as const,
      status: {
        state: TaskState.Failed,
        message: {
          role: 'agent',
          parts: [{ type: 'text', text: `Failed to check balance: ${error.message}` }],
        },
      },
    } as Task;
  }
}
```

---

### 🔄 After Hooks for Response Processing

After hooks transform raw results into structured responses:

```ts
// Response parser hook from lending-agent
export async function responseParserHook<ParsedResponse extends McpToolTxResponseData>(
  mcpResult: any,
  context: AgentContext<LendingAgentContext, any>,
  toolArgs: { resolvedToken: TokenInfo; amount: string; [key: string]: any },
  zodSchema: z.ZodType<ParsedResponse>,
  action: LendingPreview['action']
): Promise<Task> {
  const { resolvedToken, amount } = toolArgs;

  try {
    // Validate MCP response
    const parsedResponse = zodSchema.parse(mcpResult);

    if (!parsedResponse.success) {
      throw new Error(parsedResponse.error || 'Operation failed');
    }

    // Create structured response
    return {
      id: createTaskId(),
      kind: 'task' as const,
      status: {
        state: TaskState.Completed,
        message: {
          role: 'agent',
          parts: [
            {
              type: 'text',
              text: `Successfully prepared ${action} transaction for ${amount} ${resolvedToken.symbol}`,
            },
            {
              type: 'code',
              language: 'json',
              code: JSON.stringify(parsedResponse.data, null, 2),
            },
          ],
        },
      },
    } as Task;
  } catch (error) {
    return {
      id: createTaskId(),
      kind: 'task' as const,
      status: {
        state: TaskState.Failed,
        message: {
          role: 'agent',
          parts: [{ type: 'text', text: `Parsing failed: ${error.message}` }],
        },
      },
    } as Task;
  }
}
```

---

### 🔗 Composing Multiple Hooks

Use composition functions to combine multiple before hooks:

```ts
// From ember-agent
export function composeBeforeHooks<TArgs extends object>(
  ...hooks: Array<(args: TArgs, context: any) => Promise<TArgs | Task | Message>>
): (args: TArgs, context: any) => Promise<TArgs | Task | Message> {
  return async (args, context) => {
    let currentArgs = args;
    for (const hook of hooks) {
      const result = await hook(currentArgs, context);

      // Check if the hook short-circuited with Task/Message
      if (
        typeof result === 'object' &&
        result !== null &&
        'kind' in result &&
        (result.kind === 'task' || result.kind === 'message')
      ) {
        return result; // Short-circuit
      }

      currentArgs = result as TArgs; // Continue with modified args
    }
    return currentArgs;
  };
}

// Usage: combine token resolution and balance checks
export const swapTokensTool = withHooks(baseSwapTokensTool, {
  before: composeBeforeHooks(resolveTokensHook, checkBalanceHook),
  after: formatSwapResponseHook,
});
```

---

### 🛡️ Security and Validation Patterns

**Input Validation:**

```ts
export const inputValidationHook: BeforeHook<any> = async (args, context) => {
  // Sanitize and validate input
  const sanitized = {
    ...args,
    amount: Math.abs(parseFloat(args.amount)), // Ensure positive
    tokenName: args.tokenName.trim().toUpperCase(), // Normalize
  };

  if (sanitized.amount <= 0) {
    throw new VibkitError('InvalidAmount', -32602, 'Amount must be positive');
  }

  return sanitized;
};
```

**Rate Limiting:**

```ts
const rateLimiter = new Map<string, number>();

export const rateLimitHook: BeforeHook<any> = async (args, context) => {
  const userKey = context.skillInput?.walletAddress || 'anonymous';
  const now = Date.now();
  const lastCall = rateLimiter.get(userKey) || 0;

  if (now - lastCall < 1000) {
    // 1 second rate limit
    return {
      id: createTaskId(),
      kind: 'task' as const,
      status: {
        state: TaskState.Failed,
        message: {
          role: 'agent',
          parts: [{ type: 'text', text: 'Rate limit exceeded. Please wait.' }],
        },
      },
    } as Task;
  }

  rateLimiter.set(userKey, now);
  return args;
};
```

---

### ⚠️ Best Practices

**Do:**

- Use hooks for cross-cutting concerns (validation, logging, metrics)
- Return structured Task/Message objects from hooks for consistent error handling
- Compose hooks to build complex validation pipelines
- Keep business logic separate from validation logic
- Use TypeScript types to ensure hook compatibility

**Don't:**

- Mix business logic with validation in the same function
- Ignore hook short-circuit returns (Task/Message objects)
- Create hooks with side effects that can't be undone
- Bypass validation hooks in production
- Hardcode validation rules - use configuration where possible

---

### ✅ Summary

V2 hooks provide a clean, composable way to enhance tools with validation, transformation, and cross-cutting concerns. The `withHooks` utility and before/after hook patterns are fundamental to building robust agents.

Use before hooks for validation and transformation, after hooks for response formatting, and composition functions to build complex validation pipelines.

> "Hooks separate concerns cleanly. Validation stays out of business logic, and business logic stays focused."

| Pattern                   | Use Case                            | Benefits                        |
| ------------------------- | ----------------------------------- | ------------------------------- |
| **Before hooks**          | Input validation and transformation | Clean separation of concerns    |
| **After hooks**           | Response formatting and metrics     | Consistent output structure     |
| **Hook composition**      | Complex validation pipelines        | Reusable, testable validation   |
| **Short-circuit returns** | Early validation failures           | Prevents unnecessary processing |
| **Type safety**           | Hook argument and return types      | Compile-time validation         |
