# DeFi Strategy Workflow Lifecycle E2E Test

## Overview

This test validates the complete client-side lifecycle of a DeFi strategy workflow executed by Agent Node via the A2A protocol. It covers:

- Task creation and A2A streaming events
- Pause/resume for input collection
- Real delegation signing via Viem with EIP-7702 wallet
- Artifact streaming and validation
- Status transitions and terminal completion

**Test File**: `workflow-lifecycle.e2e.test.ts`
**PRD**: `.vibecode/test-workflow-lifecycle/prd.md`

---

## Setup

### 1. Environment Variables

Copy `.env.test.example` to `.env.test` and configure:

```bash
# EIP-7702 Test Wallet (must be a test-only key with no real funds!)
A2A_TEST_7702_PRIVATE_KEY=0xaaaa...

# Agent Node Test Key
A2A_TEST_AGENT_NODE_PRIVATE_KEY=0xbbbb...

# Test Chain ID (default: Arbitrum One)
A2A_TEST_CHAIN_ID=42161

# LLM Provider API Key (OpenRouter recommended)
OPENROUTER_API_KEY=your_api_key_here
```

**⚠️ IMPORTANT**: Never commit real private keys! Use test-only wallets with no real funds.

### 2. Record LLM Mock for Workflow Dispatch

The test sends a natural language message to the A2A server, which requires the LLM to decide to call the `dispatch_workflow_defi_strategy_lifecycle_mock` tool. This interaction must be recorded as an MSW mock.

**Recording Steps**:

1. **Ensure API Key is Configured**:

   ```bash
   # In .env.test
   OPENROUTER_API_KEY=your_real_api_key_here
   ```

2. **Temporarily Disable MSW** (to allow real LLM calls):

   Comment out MSW setup in the test file or use a recording mode that allows pass-through.

3. **Run the Test Once** with real LLM API access:

   ```bash
   DEBUG_TESTS=1 pnpm test:e2e -- workflow-lifecycle
   ```

4. **Capture the Request/Response**:

   The test sends:

   ```
   "Execute the defi-strategy-lifecycle-mock workflow with intent \"Test DeFi Strategy\""
   ```

   The LLM should respond with a tool call to:

   ```
   dispatch_workflow_defi_strategy_lifecycle_mock
   ```

5. **Save the Mock**:

   Create the mock file at:

   ```
   tests/mocks/data/openrouter/streaming-workflow-dispatch.json
   ```

   Use this template (replace `rawBody` with base64-encoded SSE stream):

   ```json
   {
     "metadata": {
       "service": "openrouter",
       "endpoint": "/api/v1/chat/completions",
       "method": "POST",
       "recordedAt": "2025-01-15T00:00:00.000Z"
     },
     "request": {
       "headers": {
         "Authorization": "***"
       },
       "body": {
         "model": "anthropic/claude-sonnet-4.5",
         "messages": [
           {
             "role": "user",
             "content": "Execute the defi-strategy-lifecycle-mock workflow..."
           }
         ],
         "stream": true
       }
     },
     "response": {
       "status": 200,
       "headers": {
         "content-type": "text/event-stream"
       },
       "rawBody": "<base64-encoded-sse-stream-with-tool-call>"
     }
   }
   ```

6. **Re-enable MSW** and run the test again to verify the mock works.

**Alternative**: Use the `test:record-mocks` utility if it supports capturing streaming tool calls.

---

## Test Architecture

### Mock Workflow Plugin

**File**: `tests/fixtures/workflows/defi-strategy-lifecycle-mock.ts`

This plugin simulates a DeFi strategy workflow with:

- **2 pauses** for input collection:
  1. Wallet address + amount
  2. Signed delegations (EIP-7702)
- **8 artifacts** emitted:
  - `strategy-settings` (initial config)
  - `delegations-to-sign` (requires user signature)
  - `signed-delegations` (echoed back after signing)
  - `tx-history` (initial + update)
  - `strategy-performance` (initial + update)
  - `transaction-executed` (final execution details)

### Test Helpers

**File**: `tests/utils/lifecycle-test-helpers.ts`

Provides:

- Artifact schemas (Zod) for validation
- Config workspace creation for test environment
- EIP-7702 delegation signing via Viem
- Test account management from environment

### Test Flow

1. **Setup**: Start A2A server with lifecycle workflow plugin
2. **Dispatch**: Send natural language request → LLM calls workflow dispatch tool
3. **Pause 1**: Workflow requests wallet address + amount → client resumes with data
4. **Artifacts**: Client receives Settings and Delegations artifacts
5. **Pause 2**: Workflow requests signed delegations → client signs with Viem and resumes
6. **Streaming**: Client receives multiple updates for TX History and Performance
7. **Completion**: Workflow emits final artifacts and completes
8. **Validation**: Test verifies all events, artifacts, and schemas

---

## Running the Test

### Prerequisites

- Node.js 22+
- Configured `.env.test` with test wallet keys
- Recorded LLM mock at `tests/mocks/data/openrouter/streaming-workflow-dispatch.json`

### Run Command

```bash
# Run all e2e tests
pnpm test:e2e

# Run just the workflow lifecycle test
pnpm test:e2e -- workflow-lifecycle

# With debug logging
DEBUG_TESTS=1 pnpm test:e2e -- workflow-lifecycle
```

---

## Success Criteria (from PRD)

- ✅ Task created with task ID
- ✅ Status updates: `submitted`, `working`, `input-required` (×2), `completed` (final)
- ✅ Pause/resume for wallet + amount input
- ✅ Pause/resume for signed delegations with real Viem signing
- ✅ All 6+ required artifacts emitted and validated
- ✅ Streamed updates for TX History (2+) and Performance (2+)
- ✅ Artifacts validate against Zod schemas
- ✅ Final status with `state=completed` and `final=true`
- ✅ No unmatched network requests (MSW strict mode)

---

## Troubleshooting

### Test fails with "No mock found for workflow dispatch"

**Solution**: Record the LLM mock as described in Setup section above.

### Test fails with "A2A_TEST_7702_PRIVATE_KEY not configured"

**Solution**: Add the test wallet private key to `.env.test`. Use a test-only key with no real funds.

### Delegation signing fails

**Solution**: Verify the test wallet is properly configured and the chain ID matches the workflow's chain ID.

### MSW errors about missing mocks

**Solution**: Ensure MSW handlers are properly loaded. Check `tests/mocks/handlers/index.ts` includes `openrouterHandlers`.

### Artifacts don't validate

**Solution**: Check artifact schemas in `lifecycle-test-helpers.ts` match the workflow plugin's emitted artifacts.

---

## Maintenance

### When to Update

- **Workflow plugin changes**: Update `defi-strategy-lifecycle-mock.ts` and corresponding schemas
- **A2A protocol changes**: Update validation schemas and event handling
- **Artifact format changes**: Update Zod schemas in test helpers

### Recording New Mocks

If the workflow dispatch message changes, re-record the LLM mock:

1. Update the message in the test
2. Temporarily disable MSW
3. Run test with real LLM API
4. Capture and save the new mock
5. Re-enable MSW and verify

---

## Related Documentation

- **PRD**: `.vibecode/test-workflow-lifecycle/prd.md`
- **A2A Protocol**: `typescript/lib/agent-node/src/a2a/validation.ts`
- **Workflow Types**: `typescript/lib/agent-node/src/workflows/types.ts`
- **MSW Handler Rules**: `.claude/memories/msw-handlers.md`
- **Testing Strategy**: `docs/testing-strategy.md`
