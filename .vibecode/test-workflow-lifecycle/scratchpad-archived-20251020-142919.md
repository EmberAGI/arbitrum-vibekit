# WorkflowState Refactoring Design

Branch: test/workflow-lifecycle | Created: 2025-10-19T18:12:05Z

## Overview

Redesign `WorkflowState` and `WorkflowHandler` to eliminate duplicate event publishing and enforce correct Task lifecycle management through type safety rather than documentation.

## Design Principles

- **WorkflowState** = Domain semantics (what workflow wants to express: messages, progress, artifacts, interruptions, rejections)
- **WorkflowHandler** = Task lifecycle orchestrator (manages A2A Task state transitions and protocol details)
- **Type safety enforces correctness** - Workflows cannot create duplicate status updates or invalid state transitions

---

## New WorkflowState Type Definition

```typescript
// src/workflows/types.ts

export type WorkflowState =
  | {
      type: 'status-update';
      message?: Part[] | string; // String is shorthand for [{ kind: 'text', text: ... }]
      // WorkflowHandler:
      // - Stays in current state (working/input-required/auth-required)
      // - Publishes status-update with message but final: false
      // - If string provided, converts to Part[]
    }
  | {
      type: 'artifact';
      artifact: Artifact;
      // WorkflowHandler: publishes artifact-update event
    }
  | {
      type: 'interrupted';  // Renamed from 'pause' to align with A2A terminology
      reason: 'input-required' | 'auth-required';
      message: Part[] | string; // Required - explain why interrupting
      inputSchema: z.ZodObject<Record<string, z.ZodTypeAny>>;
      artifact?: Artifact; // Optional context/preview artifact
      // WorkflowHandler:
      // 1. If artifact present: publish artifact-update FIRST
      // 2. Publish status-update (state: reason, schema in message.parts metadata)
      // 3. Transition task to input-required or auth-required
    }
  | {
      type: 'reject';
      reason: string; // Human-readable rejection reason
      // WorkflowHandler: transitions to 'rejected' terminal state
    };

// REMOVED: type: 'status' - WorkflowHandler owns all Task state transitions
// REMOVED: type: 'error' - Workflows throw errors instead
// REMOVED: type: 'progress' - Use status-update with structured message instead
// REMOVED: type: 'message' - Use status-update instead
// REMOVED: correlationId - Not needed initially, can add later if required
```

---

## A2A Task States Reference

### Active States
- `submitted` - Task created, not yet started
- `working` - Task actively executing

### Interrupted States
- `input-required` - Workflow needs user input
- `auth-required` - Workflow needs authorization/signing

### Terminal States
- `completed` - Task finished successfully
- `failed` - Task encountered an error
- `canceled` - Task was cancelled by user/system
- `rejected` - Task was rejected by workflow logic
- `unknown` - Error recovery state (reserved, not used by workflows)

---

## WorkflowHandler Responsibilities by State

### Active States

| Task State | Trigger | WorkflowHandler Actions |
|------------|---------|------------------------|
| `submitted` | `dispatchWorkflow()` | 1. Create Task event<br>2. Persist via ResultManager<br>3. Publish to event bus<br>4. Wait for persistence to complete |
| `working` | Workflow starts or resumes | 1. Publish status-update (working, final: false)<br>2. For resume: include resume metadata in Task event |

### Interrupted States

| Task State | Workflow Yields | WorkflowHandler Actions |
|------------|----------------|------------------------|
| `input-required` | `{ type: 'interrupted', reason: 'input-required', ... }` | **IF artifact present:**<br>1. Publish artifact-update<br>2. Publish status-update with schema in message.parts[0].metadata<br>**ELSE:**<br>1. Publish status-update with schema in message.parts[0].metadata<br><br>Always: Transition task state to input-required |
| `auth-required` | `{ type: 'interrupted', reason: 'auth-required', ... }` | Same as input-required |

### Terminal States

| Task State | Trigger | WorkflowHandler Actions |
|------------|---------|------------------------|
| `completed` | Generator returns (`done: true`) | 1. Publish status-update (completed, final: true)<br>2. Clean up resources (generators, listeners, event bus) |
| `failed` | Workflow throws error | 1. Catch error in try/catch<br>2. Publish status-update (failed, final: true) with error message<br>3. Clean up resources |
| `canceled` | `cancelTask()` called | 1. Abort controller fires<br>2. Call runtime.cancelExecution()<br>3. Publish status-update (canceled, final: true)<br>4. Clean up resources |
| `rejected` | `{ type: 'reject', reason: '...' }` | 1. Publish status-update (rejected, final: true) with reason message<br>2. Clean up resources |
| `unknown` | Never used by workflows | Reserved for error recovery scenarios |

---

## Event Publishing Orchestration Patterns

### Pattern 1: Simple Status Update (Progress Message)

```typescript
// Workflow yields:
yield {
  type: 'status-update',
  message: 'Analyzing market conditions for best yield...'
};

// WorkflowHandler orchestrates:
// 1. Converts string to Part[]
// 2. Publishes status-update:
//    {
//      kind: 'status-update',
//      taskId,
//      contextId,
//      status: {
//        state: 'working', // Stays in current state
//        message: {
//          kind: 'message',
//          messageId: uuidv7(),
//          contextId,
//          role: 'agent',
//          parts: [{ kind: 'text', text: 'Analyzing market conditions...' }]
//        }
//      },
//      final: false
//    }
```

### Pattern 2: Rich Status Update with Structured Data

```typescript
// Workflow yields:
yield {
  type: 'status-update',
  message: [
    { kind: 'text', text: 'Found 3 yield opportunities:' },
    {
      kind: 'data',
      data: {
        opportunities: [
          { protocol: 'Aave', apy: 5.2 },
          { protocol: 'Compound', apy: 4.8 },
          { protocol: 'Yearn', apy: 6.1 }
        ]
      },
      metadata: { mimeType: 'application/json' }
    }
  ]
};

// WorkflowHandler orchestrates:
// 1. Wraps Part[] in full Message object
// 2. Publishes status-update with rich content
// 3. Client can display table/chart of opportunities
```

### Pattern 3: Interrupt with Artifact (Form Preview)

```typescript
// Workflow yields:
yield {
  type: 'interrupted',
  reason: 'input-required',
  message: 'Please provide your wallet address and amount to invest',
  inputSchema: z.object({
    walletAddress: z.string(),
    amount: z.number().positive()
  }),
  artifact: {
    artifactId: 'investment-form-preview.json',
    name: 'Investment Form',
    parts: [{
      kind: 'data',
      data: {
        prefilledValues: { amount: 100 },
        suggestions: ['0x123...', '0x456...']
      },
      metadata: { mimeType: 'application/json' }
    }]
  }
};

// WorkflowHandler orchestrates:
// 1. Publish artifact-update (investment-form-preview.json) FIRST
// 2. Convert inputSchema to JSON Schema
// 3. Publish status-update:
//    {
//      status: {
//        state: 'input-required',
//        message: {
//          parts: [{
//            kind: 'text',
//            text: 'Please provide your wallet address and amount',
//            metadata: {
//              schema: { /* JSON Schema from Zod */ },
//              mimeType: 'application/json'
//            }
//          }]
//        }
//      },
//      final: false
//    }
// 4. Transition task to 'input-required'
```

### Pattern 4: Early Rejection

```typescript
// Workflow validates inputs and rejects before doing work:
async *execute(context: WorkflowContext) {
  const params = context.parameters as { walletAddress: string };

  // Validate wallet is on correct network
  const chainId = await getChainId(params.walletAddress);
  if (chainId !== 42161) {
    yield {
      type: 'reject',
      reason: 'Wallet address is not on Arbitrum network (chain ID 42161)'
    };
    return; // Exit immediately
  }

  // Continue with workflow...
  yield { type: 'status-update', message: 'Starting strategy execution...' };
  // ...
}

// WorkflowHandler orchestrates:
// 1. Publish status-update:
//    {
//      status: {
//        state: 'rejected',
//        message: {
//          parts: [{
//            kind: 'text',
//            text: 'Wallet address is not on Arbitrum network (chain ID 42161)'
//          }]
//        }
//      },
//      final: true
//    }
// 2. Terminate execution
// 3. Clean up resources
// 4. Task never reaches 'working' state (goes submitted → rejected)
```

---

## Additional Orchestration Scenarios

### Scenario 1: Timestamp Enrichment (Removed)

**Previous plan:** Auto-add timestamps to progress updates
**Revised:** Since we removed `type: 'progress'`, workflows use `type: 'status-update'` instead. Timestamps are NOT automatically added - workflows can include timestamp data in message parts if needed.

### Scenario 2: Validation Failure on Resume

**What:** Resume input fails Zod validation

**WorkflowHandler:**
1. Catches validation error from `execution.resume()`
2. Extracts validation errors from Zod result
3. Re-emits pause event with validation errors
4. Publishes status-update with error details in message
5. Keeps task in interrupted state (input-required/auth-required)
6. Client must fix input and retry resume

**Runtime behavior:**
```typescript
// In WorkflowRuntime.resumeWorkflow():
const parsed = zodSchema.safeParse(input);
if (!parsed.success) {
  const errors = parsed.error?.issues || [];

  // Re-emit pause with validation errors
  emit('pause', {
    ...pauseInfo,
    validationErrors: errors
  });

  return { valid: false, errors };
}
```

### Scenario 3: Multiple Artifacts in Sequence

**What:** Workflow emits multiple artifacts before interrupting

**WorkflowHandler:**
1. Publishes each artifact-update as yielded
2. All artifacts accumulate in task.artifacts[]
3. When interrupt occurs, only schema goes in status.message (not repeated in each artifact)

**Example:**
```typescript
// Workflow emits 3 analysis artifacts, then pauses:
yield { type: 'artifact', artifact: riskAnalysis };
yield { type: 'artifact', artifact: opportunityAnalysis };
yield { type: 'artifact', artifact: recommendation };
yield {
  type: 'interrupted',
  reason: 'input-required',
  message: 'Review analysis and confirm execution',
  inputSchema: z.object({ confirmed: z.boolean() })
};

// Handler publishes: artifact-update, artifact-update, artifact-update, status-update
// Task.artifacts = [riskAnalysis, opportunityAnalysis, recommendation]
// Schema only in the final status-update
```

### Scenario 4: Concurrent Resume Requests

**What:** Multiple clients try to resume same paused task

**WorkflowHandler** (current behavior - keep):
1. Track resume request order via `concurrentResumeTracking` Map
2. Add metadata to execution:
   ```typescript
   {
     concurrentRequest: true,
     requestOrder: 2,
     primaryResume: false
   }
   ```
3. Only first request actually resumes workflow
4. Later requests receive metadata indicating they were concurrent
5. All requests get validation result

### Scenario 5: Child Workflow Dispatch

**What:** A workflow dispatches another workflow as a child task

**Current state:**
- LLM lifecycle already handles this via tool calls (`dispatch_workflow_*`)
- StreamProcessor adds referenceTaskIds to parent status message

**For workflow-to-workflow dispatch (future):**
- Workflows would call a runtime helper method
- WorkflowHandler would automatically manage referenceTaskIds
- This is likely a future enhancement, not part of initial design

---

## State Machine Validation Updates

Update `src/workflows/tasks/stateMachine.ts` to support 'rejected':

```typescript
export const validTransitions: Record<TaskState, readonly TaskState[]> = {
  submitted: ['working', 'failed', 'canceled', 'rejected'], // Add rejected from submitted
  working: ['input-required', 'auth-required', 'completed', 'failed', 'canceled', 'rejected'], // Can reject mid-execution
  'input-required': ['working', 'canceled', 'rejected'], // Can reject instead of resuming
  'auth-required': ['working', 'canceled', 'rejected'], // Can reject instead of resuming
  completed: [],
  failed: [],
  canceled: [],
  rejected: [], // Terminal state
  unknown: [], // Never transition to this
} as const;
```

---

## Implementation Phases

### Phase 1: Type System Updates (Non-breaking foundation)

**Files to modify:**
- `src/workflows/types.ts`
  - Add new WorkflowState union type
  - Keep old types temporarily for backward compatibility
  - Mark old types as @deprecated in JSDoc

**Changes:**
```typescript
// Add new types
export type WorkflowState =
  | StatusUpdateState
  | ArtifactState
  | InterruptedState
  | RejectState
  | LegacyStatusState // @deprecated
  | LegacyErrorState; // @deprecated
```

### Phase 2: Runtime & Handler Updates

**Files to modify:**

1. `src/workflows/runtime.ts`
   - Add `case 'status-update':` handler (message wrapping, Part[] conversion)
   - Add `case 'interrupted':` handler (rename from pause, add artifact check)
   - Add `case 'reject':` handler (transition to rejected)
   - Keep `case 'status':` and `case 'error':` temporarily (marked deprecated)

2. `src/a2a/handlers/workflowHandler.ts`
   - Update `resumeWorkflow()` to handle validation errors properly
   - Add artifact-first orchestration for interrupted state
   - Add Part[] to Message conversion helper
   - Add string to Part[] conversion helper

3. `src/workflows/tasks/stateMachine.ts`
   - Add 'rejected' state transitions

### Phase 3: Workflow Migrations

**Update all workflows/tests to use new patterns:**

Files to update:
- `scripts/debug-pause-client.ts`
- `scripts/debug-pause-only-sse.ts`
- `tests/fixtures/workflows/defi-strategy-lifecycle-mock.ts`
- `tests/fixtures/workflows/usdai-strategy.ts`
- `tests/integration/*.int.test.ts` (workflow test helpers)
- `tests/workflow-runtime.int.test.ts`
- `src/cli/commands/init.ts` (example workflow template)

**Migration patterns:**

```typescript
// ❌ OLD: Bare status yield (creates duplicates)
yield { type: 'status', status: { state: 'working' } };

// ✅ NEW: Remove entirely (WorkflowHandler manages state transitions)
// (delete the line)

// ❌ OLD: Status with message
yield {
  type: 'status',
  status: {
    state: 'working',
    message: { parts: [{ kind: 'text', text: 'Processing...' }] }
  }
};

// ✅ NEW: Use status-update
yield {
  type: 'status-update',
  message: 'Processing...'
};

// ❌ OLD: Error yield
yield { type: 'error', error: new Error('Failed') };

// ✅ NEW: Throw error
throw new Error('Failed');

// ❌ OLD: Pause
yield {
  type: 'pause',
  status: { state: 'input-required', message: {...} },
  inputSchema: z.object({...})
};

// ✅ NEW: Interrupted
yield {
  type: 'interrupted',
  reason: 'input-required',
  message: 'Please provide wallet address',
  inputSchema: z.object({...})
};
```

### Phase 4: Deprecation & Cleanup

1. Remove deprecated handlers from runtime
2. Remove old type definitions from WorkflowState
3. Update TypeScript to make old patterns compile errors
4. Run full test suite to ensure no regressions

### Phase 5: Documentation

1. Update workflow authoring guide in `docs/`
2. Add migration guide for external workflow authors
3. Update JSDoc comments on WorkflowState types
4. Update example workflows in `src/cli/commands/init.ts`
5. Document pause+artifact pattern with examples

---

## Benefits

✅ **Eliminates duplicate events** - No more double working/completed status updates
✅ **Type safety prevents errors** - Workflows cannot create invalid state transitions
✅ **Clear separation of concerns** - Domain semantics (workflow) vs lifecycle (handler)
✅ **Proper A2A protocol compliance** - Artifact published before status when interrupting
✅ **Simpler mental model** - 4 simple concepts instead of 6+ overlapping ones
✅ **Better alignment** - Uses A2A terminology (interrupted states)
✅ **Extensible** - Easy to add new workflow yield types in future
✅ **Backward compatible path** - Phased migration minimizes disruption

---

## Key Design Decisions

1. **Removed `type: 'progress'`** - Use `status-update` with structured message instead
2. **Removed `type: 'message'`** - Use `status-update` instead (same underlying concept)
3. **Renamed 'pause' → 'interrupted'** - Aligns with A2A spec terminology
4. **Removed `correlationId`** - Not needed initially, can add later if required
5. **Workflows own rejection** - Can reject via `type: 'reject'` at any point
6. **Handler auto-adds timestamps** - For progress tracking (User request)
7. **String shorthand for messages** - Convenience: `message: 'text'` vs `message: [{ kind: 'text', text: '...' }]`

---

## Next Steps

1. Get user approval for design
2. Create implementation branch
3. Execute Phase 1 (type system updates)
4. Execute Phase 2 (runtime & handler updates)
5. Execute Phase 3 (workflow migrations)
6. Execute Phase 4 (cleanup)
7. Execute Phase 5 (documentation)
8. Merge to main after all tests pass
