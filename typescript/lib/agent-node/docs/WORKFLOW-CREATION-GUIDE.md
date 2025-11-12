# Workflow Creation Guide

**A comprehensive guide to building multi-step workflows in Agent Node**

---

## Table of Contents

- [Overview](#overview)
- [Workflow Fundamentals](#workflow-fundamentals)
- [Workflow Lifecycle](#workflow-lifecycle)
- [Creating a Workflow](#creating-a-workflow)
- [WorkflowState Types](#workflowstate-types)
- [Input Parameter Validation](#input-parameter-validation)
- [Interrupt & Resume Patterns](#interrupt--resume-patterns)
- [Artifact Emission](#artifact-emission)
- [State Transitions](#state-transitions)
- [Error Handling](#error-handling)
- [Best Practices](#best-practices)
- [Testing Workflows](#testing-workflows)
- [Advanced Patterns](#advanced-patterns)
- [Examples](#examples)

---

## Overview

Workflows in Agent Node enable building complex multi-step operations that can:

- **Pause for user input** - Request data or decisions from the user
- **Request authorization** - Pause for transaction signing or approval
- **Emit artifacts** - Return structured data and results
- **Track progress** - Send status updates throughout execution
- **Handle errors** - Gracefully fail with meaningful error messages

Workflows are **generator-based**: they use JavaScript async generator functions that `yield` state updates and `return` final results.

---

## Workflow Fundamentals

### What is a Workflow?

A workflow is a TypeScript file that exports a `WorkflowPlugin` object:

```typescript
import type { WorkflowPlugin, WorkflowContext, WorkflowState } from '@agent-node/workflows/types';
import { z } from 'zod';

const plugin: WorkflowPlugin = {
  id: 'my-workflow',
  name: 'My Workflow',
  description: 'A description of what this workflow does',
  version: '1.0.0',

  // Optional input validation schema
  inputSchema: z.object({
    param1: z.string(),
    param2: z.number(),
  }),

  // Main execution logic
  async *execute(context: WorkflowContext): AsyncGenerator<WorkflowState, unknown, unknown> {
    // Workflow logic here
    yield {
      type: 'status',
      status: {
        state: 'working',
        message: {
          /* ... */
        },
      },
    };
    return { success: true };
  },
};

export default plugin;
```

### Key Components

1. **id** - Unique identifier (converted to snake*case, becomes `dispatch_workflow*<id>` tool)
2. **name** - Human-readable name
3. **description** - What the workflow does (shown to AI and users)
4. **version** - Semantic version (e.g., "1.0.0")
5. **inputSchema** - Zod schema for validating input parameters (validated automatically before execution)
6. **dispatchResponseTimeout** - Optional timeout in milliseconds for first-yield dispatch response (default: 500ms)
7. **execute()** - Async generator function containing workflow logic

---

## Workflow Lifecycle

### States

Workflows transition through these states:

```
submitted → working → [interrupted] → completed
                   ↓                 ↓
                   └──────────────→ failed
                                    canceled
                                    rejected
```

| State            | Description                                 | Terminal? |
| ---------------- | ------------------------------------------- | --------- |
| `submitted`      | Task created, not yet started               | No        |
| `working`        | Workflow actively executing                 | No        |
| `input-required` | Paused, waiting for user input              | No        |
| `auth-required`  | Paused, waiting for authorization/signature | No        |
| `completed`      | Finished successfully                       | Yes       |
| `failed`         | Encountered an error                        | Yes       |
| `canceled`       | Canceled by user/system                     | Yes       |
| `rejected`       | Rejected by workflow logic                  | Yes       |

### Execution Flow

```typescript
async *execute(context: WorkflowContext) {
  // 1. Initial status (working)
  yield { type: 'status', status: { state: 'working', message: { /* ... */ } } };

  // 2. Do some work
  const data = await fetchData();

  // 3. Emit artifact
  yield { type: 'artifact', artifact: { /* ... */ } };

  // 4. Pause for user input
  const userInput = yield {
    type: 'pause',
    status: { state: 'input-required', message: { /* ... */ } },
    inputSchema: z.object({ /* ... */ }),
  };

  // 5. Continue working
  yield { type: 'status', status: { state: 'working', message: { /* ... */ } } };

  // 6. Complete
  yield { type: 'status', status: { state: 'completed', message: { /* ... */ } } };

  return { success: true };
}
```

---

## Creating a Workflow

### Step 1: Define the Plugin

Create a new TypeScript file in your workflows directory:

```typescript
// workflows/token-swap.ts
import type { WorkflowPlugin, WorkflowContext, WorkflowState } from '@agent-node/workflows/types';
import type { Message, Artifact } from '@a2a-js/sdk';
import { z } from 'zod';

const plugin: WorkflowPlugin = {
  id: 'token-swap',
  name: 'Token Swap',
  description: 'Execute a token swap with user approval',
  version: '1.0.0',

  inputSchema: z.object({
    fromToken: z.string(),
    toToken: z.string(),
    amount: z.string(),
  }),

  async *execute(context: WorkflowContext) {
    // Implementation below
  },
};

export default plugin;
```

### Step 2: Implement Execute Logic

```typescript
async *execute(context: WorkflowContext): AsyncGenerator<WorkflowState, unknown, unknown> {
  // Parameters are already validated by runtime if inputSchema is defined
  // Safe to type assert directly
  const params = context.parameters as { fromToken: string; toToken: string; amount: string };

  // Status update: Starting
  const startMessage: Message = {
    kind: 'message',
    messageId: 'start',
    contextId: context.contextId,
    role: 'agent',
    parts: [{ kind: 'text', text: `Starting swap of ${params.amount} ${params.fromToken} to ${params.toToken}...` }],
  };

  yield {
    type: 'status',
    status: {
      state: 'working',
      message: startMessage,
    },
  };

  // Step 1: Get quote
  const quote = await getSwapQuote(params);

  // Emit quote artifact
  const quoteArtifact: Artifact = {
    artifactId: 'swap-quote',
    name: 'swap-quote.json',
    description: 'Swap quote details',
    parts: [{
      kind: 'data',
      data: {
        fromAmount: params.amount,
        toAmount: quote.expectedOutput,
        rate: quote.rate,
        fees: quote.fees,
      },
    }],
  };

  yield { type: 'artifact', artifact: quoteArtifact };

  // Step 2: Request approval
  const approval = yield {
    type: 'pause',
    status: {
      state: 'auth-required',
      message: {
        kind: 'message',
        messageId: 'approval-request',
        contextId: context.contextId,
        role: 'agent',
        parts: [{
          kind: 'text',
          text: `Please approve the swap: ${params.amount} ${params.fromToken} → ${quote.expectedOutput} ${params.toToken}`,
        }],
      },
    },
    inputSchema: z.object({
      approved: z.boolean(),
      signature: z.string().optional(),
    }),
  };

  // Type assertion for resume value
  const approvalData = approval as { approved: boolean; signature?: string };

  if (!approvalData.approved) {
    throw new Error('User rejected the swap');
  }

  // Step 3: Execute swap
  yield {
    type: 'status',
    status: {
      state: 'working',
      message: {
        kind: 'message',
        messageId: 'executing',
        contextId: context.contextId,
        role: 'agent',
        parts: [{ kind: 'text', text: 'Executing swap...' }],
      },
    },
  };

  const txHash = await executeSwap(quote, approvalData.signature);

  // Emit transaction result
  const resultArtifact: Artifact = {
    artifactId: 'swap-result',
    name: 'swap-result.json',
    description: 'Swap transaction result',
    parts: [{
      kind: 'data',
      data: {
        transactionHash: txHash,
        status: 'confirmed',
        timestamp: new Date().toISOString(),
      },
    }],
  };

  yield { type: 'artifact', artifact: resultArtifact };

  // Complete
  yield {
    type: 'status',
    status: {
      state: 'completed',
      message: {
        kind: 'message',
        messageId: 'complete',
        contextId: context.contextId,
        role: 'agent',
        parts: [{ kind: 'text', text: 'Swap completed successfully!' }],
      },
    },
  };

  return {
    success: true,
    transactionHash: txHash,
    completedAt: new Date().toISOString(),
  };
}
```

### Step 3: Register the Workflow

Add to `workflow.json`:

```json
{
  "workflows": {
    "token-swap": {
      "path": "./workflows/token-swap.ts"
    }
  }
}
```

---

## WorkflowState Types

Workflows communicate with the runtime by yielding `WorkflowState` objects:

### 1. Status Update

```typescript
yield {
  type: 'status',
  status: {
    state: 'working' | 'completed' | 'failed',
    message?: Message,  // A2A Message object
  },
};
```

**When to use:**

- Initial "starting" message
- Progress updates during work
- Final "completed" status
- "failed" status (though throwing errors is preferred)

**Example:**

```typescript
yield {
  type: 'status',
  status: {
    state: 'working',
    message: {
      kind: 'message',
      messageId: 'progress-update',
      contextId: context.contextId,
      role: 'agent',
      parts: [{ kind: 'text', text: 'Analyzing market conditions...' }],
    },
  },
};
```

### 2. Progress Update

```typescript
yield {
  type: 'progress',
  current: 3,
  total: 10,
};
```

**When to use:**

- Tracking progress through known steps
- Showing percentage completion
- Long-running batch operations

**Example:**

```typescript
for (let i = 0; i < tokens.length; i++) {
  yield { type: 'progress', current: i + 1, total: tokens.length };
  await processToken(tokens[i]);
}
```

### 2. Artifact Emission

```typescript
yield {
  type: 'artifact',
  artifact: {
    artifactId: string,
    name: string,
    description?: string,
    parts: Array<{ kind: 'text' | 'data' | 'blob'; /* ... */ }>,
  },
};
```

**When to use:**

- Returning structured data
- Emitting intermediate results
- Providing downloadable files
- Showing charts/visualizations

**Example:**

```typescript
yield {
  type: 'artifact',
  artifact: {
    artifactId: 'portfolio-analysis',
    name: 'portfolio-analysis.json',
    description: 'Detailed portfolio analysis results',
    parts: [{
      kind: 'data',
      data: {
        totalValue: 50000,
        positions: [...],
        recommendations: [...],
      },
    }],
  },
};
```

### 3. Interrupted (Input/Auth Required)

```typescript
const userInput = yield {
  type: 'interrupted',
  reason: 'input-required' | 'auth-required',
  message: Part[] | string,
  inputSchema: z.object({ /* ... */ }),
  artifact?: Artifact,  // Optional preview/context artifact
};
```

**When to use:**

- Requesting user input
- Requesting transaction signatures
- Waiting for external approvals
- Multi-step confirmations

**Examples:**

```typescript
// Simple input request
const walletInput = yield {
  type: 'interrupted',
  reason: 'input-required',
  message: 'Please provide your wallet address',
  inputSchema: z.object({
    walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  }),
};

// Type assertion for the resume value
const wallet = walletInput as { walletAddress: string };

// With preview artifact
yield {
  type: 'interrupted',
  reason: 'auth-required',
  message: 'Please approve the transaction',
  inputSchema: z.object({ approved: z.boolean() }),
  artifact: {
    artifactId: 'tx-preview',
    name: 'transaction-preview.json',
    parts: [{ kind: 'data', data: { gasEstimate: '21000', ... } }],
  },
};
```

### 4. Reject

```typescript
yield {
  type: 'reject',
  reason: string,  // Human-readable rejection reason
};
```

**When to use:**

- Early validation failures
- Business logic rejects the request
- Conditions not met to proceed

**Important:** After yielding reject, immediately `return` to exit the workflow.

**Example:**

```typescript
// Validate wallet is on correct network
const chainId = await getChainId(params.walletAddress);
if (chainId !== 42161) {
  yield {
    type: 'reject',
    reason: 'Wallet address is not on Arbitrum network (chain ID 42161)',
  };
  return;
}
```

### 5. Dispatch Response

```typescript
yield {
  type: 'dispatch-response',
  parts: Part[],  // Data to include in tool call response
};
```

**Purpose:** Return immediate data when workflow is dispatched via tool call (e.g., balance checks, quick confirmations).

**Rules:**

- Must be the **first yield** only
- Default timeout: 500ms (configurable via `dispatchResponseTimeout`)
- Only works when dispatched via tool call

**Example:**

```typescript
const plugin: WorkflowPlugin = {
  id: 'balance-strategy',
  dispatchResponseTimeout: 2000, // Optional: override for API calls

  async *execute(context: WorkflowContext) {
    const balance = await getTokenBalance(params.walletAddress, params.token);

    // First yield: provide balance in tool call response
    yield {
      type: 'dispatch-response',
      parts: [{ kind: 'data', data: { balance, token, walletAddress } }],
    };

    // Continue workflow...
    yield { type: 'status-update', message: `Starting strategy...` };
  },
};
```

The AI receives the dispatch-response data merged into the tool call result immediately.

---

## Input Parameter Validation

**Runtime automatically validates `inputSchema` before workflow execution.**

- ✅ Valid → workflow executes
- ❌ Invalid → returns failed execution, workflow never starts

**Usage:**

```typescript
const plugin: WorkflowPlugin = {
  inputSchema: z.object({
    toAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    amount: z.string(),
    token: z.enum(['USDC', 'DAI', 'USDT']),
  }),

  async *execute(context: WorkflowContext) {
    // Safe to type assert - runtime already validated
    const params = context.parameters as z.infer<typeof inputSchema>;

    // Handle business logic validation only
    const balance = await getBalance(params.toAddress);
    if (parseFloat(params.amount) > balance) {
      yield { type: 'reject', reason: 'Insufficient balance' };
      return;
    }
    // ...
  },
};
```

**Division of Responsibility:**

- **Runtime (inputSchema):** Types, formats, required fields, enums, ranges
- **Workflow (manual checks):** Business rules, external constraints, dynamic validation

**Rules:**

- ✅ Use type assertions: `context.parameters as z.infer<typeof inputSchema>`
- ✅ Validate business logic with `yield { type: 'reject' }`
- ❌ Don't re-parse schema: `inputSchema.parse(context.parameters)` - runtime already did this

---

## Interrupt & Resume Patterns

### Basic Interrupt

```typescript
const input = yield {
  type: 'interrupted',
  reason: 'input-required',
  message: 'Please provide your email address',
  inputSchema: z.object({
    email: z.string().email(),
  }),
};

const userEmail = (input as { email: string }).email;
```

### Interrupt with Artifact Preview

Emit an artifact BEFORE pausing to provide context:

```typescript
// First, emit preview artifact
yield {
  type: 'artifact',
  artifact: {
    artifactId: 'swap-preview',
    name: 'swap-preview.json',
    description: 'Preview of the proposed swap',
    parts: [{
      kind: 'data',
      data: {
        input: { token: 'USDC', amount: '1000' },
        output: { token: 'DAI', amount: '998.5' },
        fee: '1.5 USDC',
        slippage: '0.5%',
      },
    }],
  },
};

// Then interrupt for approval
const approval = yield {
  type: 'interrupted',
  reason: 'auth-required',
  message: 'Review the swap preview and approve',
  inputSchema: z.object({
    approved: z.boolean(),
  }),
};
```

### Multiple Interrupts

```typescript
// First interrupt: Get wallet
const walletInput = yield {
  type: 'interrupted',
  reason: 'input-required',
  message: 'Please provide your wallet address',
  inputSchema: z.object({
    walletAddress: z.string(),
  }),
};

// Do some work
const balance = await checkBalance((walletInput as { walletAddress: string }).walletAddress);

// Second interrupt: Get amount
const amountInput = yield {
  type: 'interrupted',
  reason: 'input-required',
  message: `Your balance is ${balance}. How much to transfer?`,
  inputSchema: z.object({
    amount: z.string(),
  }),
};

// Continue...
```

### Input Validation

**The runtime validates ALL resume input against `inputSchema` BEFORE resuming your workflow.**

**What this means:**

- ✅ Valid input → workflow resumes with validated data
- ❌ Invalid input → workflow stays paused, client receives validation error

**Rules:**

```typescript
const input = yield {
  type: 'interrupted',
  reason: 'input-required',
  message: 'Enter transfer amount',
  inputSchema: z.object({
    amount: z.string(),  // ← Runtime validates type/format
    toAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  }),
};

// ✅ Safe: Runtime already validated the schema
const { amount, toAddress } = input as { amount: string; toAddress: string };

// ✅ Workflow handles business logic validation
const amountNum = parseFloat(amount);
if (amountNum > await getBalance()) {
  throw new Error('Insufficient balance');
}

// ❌ NEVER re-parse inside workflow - runtime already did this
// const validated = inputSchema.parse(input);  // DON'T DO THIS
```

**Division of responsibility:**

- **Runtime** → Type/format/required field validation (via Zod schema)
- **Workflow** → Business rules/value ranges/external constraints (via manual checks)

Invalid input keeps the workflow paused and returns error details to the client automatically.

---

## Artifact Emission

### Artifact Structure

```typescript
interface Artifact {
  artifactId: string; // Unique ID for this artifact
  name: string; // Filename or display name
  description?: string; // Human-readable description
  parts: Part[]; // Content parts
}

type Part =
  | { kind: 'text'; text: string }
  | { kind: 'data'; data: unknown; metadata?: { mimeType?: string } }
  | { kind: 'blob'; blob: Blob; metadata?: { mimeType?: string } };
```

### Text Artifact

```typescript
yield {
  type: 'artifact',
  artifact: {
    artifactId: 'analysis-report',
    name: 'analysis-report.txt',
    description: 'Market analysis report',
    parts: [{
      kind: 'text',
      text: 'Market Analysis Report\n\nThe market is showing...',
    }],
  },
};
```

### JSON Data Artifact

```typescript
yield {
  type: 'artifact',
  artifact: {
    artifactId: 'portfolio-data',
    name: 'portfolio.json',
    description: 'Portfolio holdings',
    parts: [{
      kind: 'data',
      data: {
        totalValue: 100000,
        positions: [
          { symbol: 'BTC', amount: 0.5, value: 25000 },
          { symbol: 'ETH', amount: 10, value: 30000 },
        ],
      },
      metadata: { mimeType: 'application/json' },
    }],
  },
};
```

### Multi-Part Artifact

```typescript
yield {
  type: 'artifact',
  artifact: {
    artifactId: 'transaction-receipt',
    name: 'transaction-receipt.json',
    description: 'Transaction confirmation',
    parts: [
      {
        kind: 'text',
        text: 'Transaction successful!',
      },
      {
        kind: 'data',
        data: {
          transactionHash: '0x123...',
          blockNumber: 12345,
          gasUsed: '21000',
        },
      },
    ],
  },
};
```

### Sequential Artifacts

Emit multiple artifacts throughout the workflow:

```typescript
// Step 1: Analysis
yield { type: 'artifact', artifact: analysisArtifact };

// Step 2: Recommendation
yield { type: 'artifact', artifact: recommendationArtifact };

// Step 3: Execution result
yield { type: 'artifact', artifact: resultArtifact };
```

All artifacts accumulate in `task.artifacts[]`.

---

## State Transitions

### Valid Transitions

The WorkflowHandler enforces state machine transitions:

```typescript
submitted → working | failed | canceled | rejected
working → input-required | auth-required | completed | failed | canceled | rejected
input-required → working | canceled | rejected
auth-required → working | canceled | rejected
completed → (terminal)
failed → (terminal)
canceled → (terminal)
rejected → (terminal)
```

### Explicit vs Implicit Transitions

**Implicit (Automatic):**

- `submitted` → `working` - When workflow starts
- `working` → `completed` - When generator returns (done: true)
- `working` → `failed` - When workflow throws error

**Explicit (Via yield):**

- `working` → `input-required` - Yield pause with state: 'input-required'
- `working` → `auth-required` - Yield pause with state: 'auth-required'
- `input-required` → `working` - Resume after input
- Any → `completed` - Yield status with state: 'completed'

### Early Rejection

Workflows can reject early if conditions aren't met:

```typescript
async *execute(context: WorkflowContext) {
  const params = context.parameters as { walletAddress: string };

  // Validate wallet is on correct chain
  const chainId = await getChainId(params.walletAddress);

  if (chainId !== 42161) {
    // Option 1: Throw error (becomes 'failed')
    throw new Error('Wallet must be on Arbitrum (chain ID 42161)');

    // Option 2: Explicit rejection (future feature - not yet implemented)
    // yield {
    //   type: 'reject',
    //   reason: 'Wallet must be on Arbitrum (chain ID 42161)',
    // };
    // return;
  }

  // Continue with workflow...
}
```

---

## Error Handling

### Throwing Errors

**Preferred approach:**

```typescript
async *execute(context: WorkflowContext) {
  yield { type: 'status', status: { state: 'working', message: { /* ... */ } } };

  try {
    const result = await riskyOperation();
  } catch (err) {
    // Re-throw with context
    throw new Error(`Failed to complete operation: ${err.message}`);
  }
}
```

**What happens:**

1. WorkflowHandler catches the error
2. Transitions task to `failed`
3. Publishes status-update with error message
4. Cleans up resources

### Error Yield (Discouraged)

```typescript
yield {
  type: 'error',
  error: new Error('Something went wrong'),
};
```

**Issues:**

- Workflow continues executing after error
- Less clear than throwing
- More complex error handling logic

### Validation Errors

Input validation is automatic:

```typescript
// Define schema
const input = yield {
  type: 'pause',
  status: { state: 'input-required', message: { /* ... */ } },
  inputSchema: z.object({
    email: z.string().email(),
    age: z.number().min(18),
  }),
};

// If user submits invalid data:
// - Runtime validates with Zod
// - Re-emits pause with validationErrors
// - Waits for corrected input
// - No action needed in workflow code
```

---

## Best Practices

### 1. Always Provide Clear Messages

```typescript
// ❌ Bad: No message
yield { type: 'status-update' };

// ✅ Good: Descriptive message
yield {
  type: 'status-update',
  message: 'Analyzing market conditions for best yield opportunities...',
};
```

### 2. Use Artifacts for Structured Data

```typescript
// ❌ Bad: JSON in text message
yield {
  type: 'status-update',
  message: JSON.stringify({ rate: 1.05, fee: 0.01 }),
};

// ✅ Good: Proper artifact
yield {
  type: 'artifact',
  artifact: {
    artifactId: 'quote-details',
    name: 'quote.json',
    parts: [{
      kind: 'data',
      data: { rate: 1.05, fee: 0.01 },
    }],
  },
};
```

### 3. Emit Artifacts BEFORE Interrupting

```typescript
// ✅ Good: Preview then interrupt
yield { type: 'artifact', artifact: swapPreview };
const approval = yield {
  type: 'interrupted',
  reason: 'auth-required',
  message: 'Please approve the swap',
  inputSchema: z.object({ approved: z.boolean() }),
};

// ✅ Better: Use artifact field (emitted automatically)
const approval = yield {
  type: 'interrupted',
  reason: 'auth-required',
  message: 'Please approve the swap',
  inputSchema: z.object({ approved: z.boolean() }),
  artifact: swapPreview,
};
```

### 4. Use Strong Input Schemas

```typescript
// ❌ Bad: Any string
inputSchema: z.object({
  wallet: z.string(),
});

// ✅ Good: Validated Ethereum address
inputSchema: z.object({
  wallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
});
```

### 5. Type Assert Resume Values

```typescript
// ✅ Good: Type assertion
const input = yield {
  type: 'interrupted',
  reason: 'input-required',
  message: 'Please provide email and amount',
  inputSchema: z.object({
    email: z.string(),
    amount: z.number(),
  }),
};

const { email, amount } = input as { email: string; amount: number };
```

### 6. Provide Context in Error Messages

```typescript
// ❌ Bad: Generic error
throw new Error('Transaction failed');

// ✅ Good: Contextual error
throw new Error(
  `Failed to execute swap: ${params.fromToken} → ${params.toToken}. ` + `Error: ${err.message}`,
);
```

### 7. Provide Progress Updates for Long Operations

```typescript
// ✅ Good: Track progress through batches
const batches = chunk(items, 10);
for (let i = 0; i < batches.length; i++) {
  yield {
    type: 'status-update',
    message: `Processing batch ${i + 1} of ${batches.length}...`,
  };
  await processBatch(batches[i]);
}
```

---

## Testing Workflows

### Unit Testing

Test workflow logic in isolation:

```typescript
// workflows/token-swap.unit.test.ts
import { describe, it, expect } from 'vitest';
import tokenSwapPlugin from './token-swap.js';

describe('Token Swap Workflow', () => {
  it('should yield working status on start', async () => {
    const context = {
      contextId: 'ctx-1',
      taskId: 'task-1',
      parameters: {
        fromToken: 'USDC',
        toToken: 'DAI',
        amount: '100',
      },
    };

    const generator = tokenSwapPlugin.execute(context);
    const firstYield = await generator.next();

    expect(firstYield.value).toMatchObject({
      type: 'status',
      status: { state: 'working' },
    });
  });

  it('should interrupt for approval', async () => {
    const context = {
      /* ... */
    };
    const generator = tokenSwapPlugin.execute(context);

    await generator.next(); // Skip first status
    const interruptYield = await generator.next();

    expect(interruptYield.value).toMatchObject({
      type: 'interrupted',
      reason: 'auth-required',
    });
  });
});
```

### Integration Testing

Test workflow with WorkflowRuntime:

```typescript
// workflows/token-swap.int.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { WorkflowRuntime } from '@agent-node/workflows/runtime';
import tokenSwapPlugin from './token-swap.js';

describe('Token Swap Integration', () => {
  let runtime: WorkflowRuntime;

  beforeEach(() => {
    runtime = new WorkflowRuntime();
    runtime.register(tokenSwapPlugin);
  });

  it('should execute full workflow with resume', async () => {
    const execution = runtime.dispatch('token-swap', {
      contextId: 'ctx-1',
      parameters: {
        fromToken: 'USDC',
        toToken: 'DAI',
        amount: '100',
      },
    });

    // Wait for pause
    await new Promise((resolve) => {
      execution.on('pause', () => resolve(undefined));
    });

    // Resume with approval
    await execution.resume({ approved: true, signature: '0x...' });

    // Wait for completion
    const result = await execution.waitForCompletion();

    expect(result).toMatchObject({
      success: true,
      transactionHash: expect.stringMatching(/^0x/),
    });
  });
});
```

### E2E Testing

Test workflow via A2A protocol:

```typescript
// workflows/token-swap.e2e.test.ts
import { describe, it, expect } from 'vitest';
import { A2AClient } from '@a2a-js/sdk/client';

describe('Token Swap E2E', () => {
  it('should dispatch workflow via AI tool call', async () => {
    const client = await A2AClient.fromCardUrl('http://localhost:3000/.well-known/agent-card.json');

    const response = await client.sendMessage({
      message: {
        kind: 'message',
        messageId: 'msg-1',
        role: 'user',
        parts: [
          {
            kind: 'text',
            text: 'Swap 100 USDC to DAI',
          },
        ],
      },
    });

    expect(response.kind).toBe('task');
    expect(response.status.state).toBe('working');
  });
});
```

---

## Advanced Patterns

### Child Workflow Dispatch

Dispatch another workflow from within a workflow:

```typescript
async *execute(context: WorkflowContext) {
  // Parent workflow logic
  yield { type: 'status', status: { state: 'working', message: { /* ... */ } } };

  // Dispatch child workflow
  const childExecution = this.runtime.dispatch('child-workflow', {
    contextId: context.contextId,
    parameters: { /* ... */ },
  });

  // Wait for child to complete
  const childResult = await childExecution.waitForCompletion();

  // Continue parent workflow
  yield { type: 'artifact', artifact: { /* child result */ } };
}
```

**Note:** `this.runtime` is not automatically available. You would need to pass the runtime instance via dependency injection or context.

### Conditional Branching

```typescript
async *execute(context: WorkflowContext) {
  const params = context.parameters as { strategy: 'aggressive' | 'conservative' };

  if (params.strategy === 'aggressive') {
    yield { type: 'artifact', artifact: aggressiveAnalysis };
    // ... aggressive logic
  } else {
    yield { type: 'artifact', artifact: conservativeAnalysis };
    // ... conservative logic
  }
}
```

### Retry Logic

```typescript
async *execute(context: WorkflowContext) {
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    try {
      const result = await unstableOperation();
      yield { type: 'artifact', artifact: { /* result */ } };
      break;
    } catch (err) {
      attempts++;
      if (attempts >= maxAttempts) {
        throw new Error(`Failed after ${maxAttempts} attempts: ${err.message}`);
      }

      yield {
        type: 'status',
        status: {
          state: 'working',
          message: {
            parts: [{
              kind: 'text',
              text: `Attempt ${attempts} failed, retrying...`,
            }],
          },
        },
      };

      await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
    }
  }
}
```

### Batch Processing with Progress

```typescript
async *execute(context: WorkflowContext) {
  const items = await fetchItems();
  const batches = chunk(items, 10);

  for (let i = 0; i < batches.length; i++) {
    yield {
      type: 'status-update',
      message: `Processing batch ${i + 1} of ${batches.length}...`,
    };

    const results = await Promise.all(
      batches[i].map(item => processItem(item))
    );

    yield {
      type: 'artifact',
      artifact: {
        artifactId: `batch-${i}-results`,
        name: `batch-${i}.json`,
        parts: [{ kind: 'data', data: results }],
      },
    };
  }
}
```

---

## Examples

### Example 1: Simple Data Fetch

```typescript
const plugin: WorkflowPlugin = {
  id: 'fetch-token-price',
  name: 'Fetch Token Price',
  description: 'Fetch current price for a token',
  version: '1.0.0',

  inputSchema: z.object({
    tokenSymbol: z.string(),
  }),

  async *execute(context: WorkflowContext) {
    const { tokenSymbol } = context.parameters as { tokenSymbol: string };

    yield {
      type: 'status-update',
      message: `Fetching price for ${tokenSymbol}...`,
    };

    const price = await fetchPrice(tokenSymbol);

    yield {
      type: 'artifact',
      artifact: {
        artifactId: 'token-price',
        name: 'price.json',
        parts: [
          {
            kind: 'data',
            data: { symbol: tokenSymbol, price, timestamp: Date.now() },
          },
        ],
      },
    };

    yield {
      type: 'status-update',
      message: `Price: $${price}`,
    };

    return { price };
  },
};
```

### Example 2: Multi-Step with Approval

```typescript
const plugin: WorkflowPlugin = {
  id: 'approve-and-swap',
  name: 'Approve and Swap',
  description: 'Approve token spend and execute swap',
  version: '1.0.0',

  inputSchema: z.object({
    tokenAddress: z.string(),
    spenderAddress: z.string(),
    amount: z.string(),
  }),

  async *execute(context: WorkflowContext) {
    const params = context.parameters as {
      tokenAddress: string;
      spenderAddress: string;
      amount: string;
    };

    // Step 1: Request approval signature
    yield {
      type: 'status-update',
      message: 'Preparing approval transaction...',
    };

    const approvalTx = await buildApprovalTx(params);

    const approvalSig = yield {
      type: 'interrupted',
      reason: 'auth-required',
      message: 'Please sign the approval transaction',
      inputSchema: z.object({
        signature: z.string(),
      }),
    };

    // Step 2: Submit approval
    yield {
      type: 'status-update',
      message: 'Submitting approval...',
    };

    const approvalHash = await submitTx(
      approvalTx,
      (approvalSig as { signature: string }).signature,
    );

    yield {
      type: 'artifact',
      artifact: {
        artifactId: 'approval-tx',
        name: 'approval-tx.json',
        parts: [{ kind: 'data', data: { txHash: approvalHash } }],
      },
    };

    // Step 3: Wait for confirmation
    await waitForConfirmation(approvalHash);

    // Step 4: Request swap signature
    const swapTx = await buildSwapTx(params);

    const swapSig = yield {
      type: 'interrupted',
      reason: 'auth-required',
      message: 'Please sign the swap transaction',
      inputSchema: z.object({
        signature: z.string(),
      }),
    };

    // Step 5: Submit swap
    const swapHash = await submitTx(swapTx, (swapSig as { signature: string }).signature);

    yield {
      type: 'artifact',
      artifact: {
        artifactId: 'swap-tx',
        name: 'swap-tx.json',
        parts: [{ kind: 'data', data: { txHash: swapHash } }],
      },
    };

    yield {
      type: 'status-update',
      message: 'Swap completed successfully!',
    };

    return { approvalHash, swapHash };
  },
};
```

### Example 3: USDAi Strategy (Real-World)

See the full implementation in `tests/fixtures/workflows/usdai-strategy.ts`:

- Creates MetaMask smart account for agent
- Pauses for user wallet + amount
- Constructs delegations for token approval and Pendle liquidity supply
- Emits delegation artifact for user to sign
- Pauses for signed delegations
- Executes approval and liquidity supply transactions
- Emits transaction receipt artifacts

---

## Summary

Workflows enable building complex multi-step operations with:

- **Generator-based execution** - Use `yield` for state updates, `return` for results
- **Automatic input validation** - Runtime validates `inputSchema` before workflow starts
- **Dispatch response** - Return immediate data when dispatched via tool call
- **Pause/resume** - Request input or authorization at any point
- **Artifact emission** - Return structured data throughout execution
- **Type safety** - Zod schemas validate inputs automatically
- **State machine** - Enforced transitions prevent invalid states
- **Error handling** - Throw errors for clean failure handling

**Key Takeaways:**

1. Use `yield` to communicate state, not console.log
2. Always provide clear messages for user visibility
3. Define `inputSchema` - runtime validates automatically, no manual parsing needed
4. Use `dispatch-response` as first yield to provide immediate tool call response data
5. Configure `dispatchResponseTimeout` if first yield needs API calls
6. Emit artifacts BEFORE pausing for preview
7. Use strong Zod schemas for input validation
8. Type assert parameters and resume values for type safety
9. Separate schema validation (automatic) from business logic validation (manual)
10. Throw errors instead of yielding error states
11. Test workflows at unit, integration, and E2E levels

---

For more examples and patterns, see:

- `tests/fixtures/workflows/usdai-strategy.ts` - Complex DeFi workflow
- `.vibecode/test-workflow-lifecycle/scratchpad.md` - Design documentation
- `src/workflows/runtime.ts` - Runtime implementation
- `src/a2a/handlers/workflowHandler.ts` - Handler orchestration
