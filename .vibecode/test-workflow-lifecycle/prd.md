# Product Requirements Document: USDai Strategy Workflow Integration Test

Created: 2025-10-18T00:28:00Z
Status: Draft
Branch: test/workflow-lifecycle

## Overview

Create a comprehensive integration test for the `usdai-strategy.ts` workflow that validates the complete A2A client-server interaction flow including EIP-7702 wallet management, MetaMask Delegation Toolkit (MMDT) SDK integration, delegation signing, and workflow pause/resume cycles. The test will use the existing `a2a-client-protocol.int.test.ts` as a foundation, extending it with blockchain wallet operations, MMDT SDK integration, and delegation handling specific to the USDai liquidity strategy workflow.

**Important**: This is a hybrid integration test where the EIP-7702 wallet upgrade to MMDT smart account is a **real blockchain transaction** (requiring gas and confirmation), while all subsequent workflow operations (token approvals, liquidity supply) are **mocked via MSW handlers**. This approach validates the real wallet upgrade flow while keeping workflow execution fast and deterministic.

## Business Requirements

### Objectives

1. **Validate Workflow Lifecycle**: Ensure the `usdai-strategy.ts` workflow correctly handles the complete lifecycle from dispatch through multiple pause/resume cycles to completion
2. **Test Delegation Flow**: Verify client-side delegation creation, signing, and submission using real cryptographic operations with MMDT SDK
3. **Ensure Protocol Compliance**: Validate that the workflow adheres to A2A protocol specifications for streaming, artifacts, and status transitions
4. **Enable Regression Testing**: Create a reliable automated test that catches integration issues between the workflow, A2A protocol, and MMDT SDK

### User Stories

- As a **developer**, I want an integration test that validates the complete USDai strategy workflow so that I can confidently make changes without breaking the delegation flow
- As a **QA engineer**, I want to verify that EIP-7702 wallet upgrades and delegation signing work correctly in the workflow context
- As a **protocol engineer**, I want to ensure the workflow correctly implements the A2A streaming protocol with proper artifact emission and status transitions

## Success Criteria

- [ ] Test successfully creates and initializes an A2A client connected to test server
- [ ] Test successfully upgrades EIP-7702 test wallet to MetaMask Delegation Toolkit smart account via **real blockchain transaction** (if not already upgraded)
- [ ] Test dispatches `usdai-strategy` workflow and receives workflow task ID via A2A protocol
- [ ] Test subscribes to workflow stream using `resubscribeTask()` pattern
- [ ] Test detects first pause (wallet address + amount input) and successfully resumes workflow with valid input
- [ ] Test receives `delegations-to-sign` artifact with two delegations (approve, supply)
- [ ] Test signs both delegations using MMDT SDK and test wallet from `A2A_TEST_7702_PRIVATE_KEY`
- [ ] Test detects second pause (delegation signing input) and successfully resumes with signed delegations
- [ ] Test receives `transaction-executed` artifact(s) confirming workflow execution
- [ ] Test validates all status transitions: working → input-required (pause 1) → working → input-required (pause 2) → working → completed
- [ ] Test validates artifact schemas match expected structure (delegations, transactions)
- [ ] Test completes without timeouts or hanging promises
- [ ] Test uses MSW handlers to mock workflow blockchain RPC calls (approve, supply transactions)
- [ ] Test allows real blockchain transaction for wallet upgrade to MMDT smart account
- [ ] Test properly cleans up resources (server, subscriptions, workflows) in afterEach

## Technical Requirements

### Functional Requirements

#### Test Structure

1. **Test File Location**: `tests/integration/usdai-strategy-workflow.int.test.ts`
2. **Test Suite Name**: `USDai Strategy Workflow Integration`
3. **Test Case Name**: `should complete USDai strategy workflow with EIP-7702 delegation signing`
4. **Test Framework**: Vitest with async/await patterns
5. **Timeout**: 60000ms (60 seconds) to accommodate workflow execution and multiple pause/resume cycles

#### Test Setup (beforeEach)

1. Initialize `WorkflowRuntime` instance
2. Register `usdai-strategy` workflow plugin from fixtures
3. Create test server using `createTestA2AServerWithStubs()` with workflow runtime
4. Initialize `A2AClient` from agent card URL
5. Load test account from `A2A_TEST_7702_PRIVATE_KEY` environment variable
6. Initialize MMDT SDK clients (public, bundler, paymaster, pimlico) with real Arbitrum RPC endpoints
7. Check if test wallet is already upgraded to MMDT smart account
8. If not upgraded: Execute **real blockchain transaction** to upgrade wallet using `toMetaMaskSmartAccount()` (requires gas)
9. Wait for upgrade transaction confirmation before proceeding
10. Cache upgraded smart account address for test use

#### Test Execution Flow

1. **Workflow Dispatch**
   - Send message via `client.sendMessageStream()` to trigger workflow dispatch
   - Extract workflow task ID from `referenceTaskIds` in status update event
   - Track parent stream events asynchronously

2. **Workflow Subscription**
   - Subscribe to workflow task stream using `client.resubscribeTask({ id: workflowTaskId })`
   - Set up async event collection for workflow events
   - Implement timeout mechanism for stream (5000ms)

3. **First Pause - Wallet Input**
   - Detect `input-required` status from workflow stream
   - Resume workflow with wallet address and amount:
     ```typescript
     {
       walletAddress: testAccount.address,
       amount: "1000"
     }
     ```
   - Send via `client.sendMessage()` with `taskId` targeting workflow

4. **Delegation Signing**
   - Collect `delegations-to-sign` artifact from workflow stream
   - Extract delegation data from artifact parts
   - For each delegation:
     - Use MMDT SDK to parse/validate delegation structure
     - Sign delegation using test account and MMDT signing utilities
     - Collect signed delegation with ID mapping
   - Prepare signed delegations response:
     ```typescript
     {
       delegations: [
         { id: "approveUsdai", signedDelegation: "0x..." },
         { id: "supplyPendle", signedDelegation: "0x..." }
       ]
     }
     ```

5. **Second Pause - Delegation Submission**
   - Detect second `input-required` status from workflow stream
   - Resume workflow with signed delegations
   - Send via `client.sendMessage()` with `taskId` targeting workflow

6. **Completion Validation**
   - Wait for workflow stream to emit final `completed` status
   - Collect all artifacts emitted during workflow execution
   - Validate artifact schemas and content

#### Test Teardown (afterEach)

1. Close workflow stream subscriptions
2. Clean up test server using `cleanupTestServer()`
3. Clean up agent config handle
4. Ensure no hanging promises or event listeners

### Non-Functional Requirements

#### Performance
- Test must complete within 60 seconds under normal conditions
- Mock handlers must respond within 100ms to avoid test timeouts
- Workflow subscription must not leak memory or event listeners

#### Reliability
- Test must be deterministic (pass/fail consistently)
- Test must handle race conditions (workflow pausing before subscription)
- Test must gracefully handle cleanup even on failure

#### Maintainability
- Test code must follow existing test patterns from `a2a-client-protocol.int.test.ts`
- Test must use descriptive variable names and comments explaining workflow stages
- Test must separate concerns (setup, execution, validation, cleanup)

## Integration Points

### A2A Client SDK
- **sendMessageStream()**: Dispatch workflow and receive parent stream events
- **resubscribeTask()**: Subscribe to workflow task stream for events
- **sendMessage()**: Resume workflow at pause points with input data
- **getTask()**: Optionally fetch workflow state for backfill

### MetaMask Delegation Toolkit SDK
- **toMetaMaskSmartAccount()**: Upgrade EIP-7702 wallet to MMDT smart account
- **createDelegation()**: Create delegation structures (if needed for validation)
- **Implementation.Hybrid**: Use hybrid implementation for smart account
- **DelegationManager**: Encode delegation redemption calls (for validation)
- **Delegation signing**: Sign delegations following EIP-7702 specification

### Viem
- **privateKeyToAccount()**: Load test account from environment variable
- **createPublicClient()**: Create Arbitrum public client for RPC calls
- **createBundlerClient()**: Create bundler client for user operations
- **createPaymasterClient()**: Create paymaster client for gas sponsorship
- **Account signing methods**: Sign delegations using account.signTypedData()

### Test Infrastructure
- **createTestA2AServerWithStubs()**: Create test server with workflow runtime
- **cleanupTestServer()**: Clean up server and resources
- **WorkflowRuntime**: Register and manage workflow plugins
- **MSW Handlers**: Mock blockchain RPC calls and responses

### Workflow Plugin
- **usdai-strategy.ts**: The workflow being tested
- **Workflow Context**: Access taskId, contextId for correlation
- **Workflow State**: Artifact emission, status transitions, pause/resume

## Constraints & Considerations

### Technical Constraints

1. **Environment Variables**: Test requires `A2A_TEST_7702_PRIVATE_KEY` and `A2A_TEST_AGENT_NODE_PRIVATE_KEY` in `.env.test`
2. **Blockchain Mocking**: Workflow blockchain interactions (approve, supply) must be mocked via MSW handlers
3. **Real Blockchain Access**: Wallet upgrade requires real Arbitrum RPC access and gas for transaction
4. **Funded Test Wallet**: Test wallet must have sufficient ETH on Arbitrum for wallet upgrade gas (if not already upgraded)
5. **Chain ID**: Test must use chain ID 42161 (Arbitrum One) to match workflow expectations
6. **MMDT SDK Version**: Test depends on `@metamask/delegation-toolkit` version installed in project
7. **Test Isolation**: Test must not interfere with other parallel tests (use unique context IDs)
8. **Network Dependency**: Test has external dependency on Arbitrum network for wallet upgrade (may fail if network is down)

### Business Constraints

1. **Test Execution Time**: Must complete within CI/CD timeout limits (60s maximum, may be longer on first run if wallet upgrade needed)
2. **Minimal Real Funds**: Test only requires ETH for wallet upgrade gas (one-time cost, subsequent runs are free)
3. **Deterministic Behavior**: Test must produce consistent results across environments (after initial wallet upgrade)

### Risks

1. **Workflow Behavior Changes**: If `usdai-strategy.ts` changes its pause/resume pattern, test may break
   - *Mitigation*: Document workflow contract and update test when workflow changes intentionally

2. **MSW Handler Gaps**: Missing or incorrect mock handlers may cause test failures
   - *Mitigation*: Create comprehensive handlers covering all RPC methods used by workflow

3. **Race Conditions**: Workflow may pause before test subscribes to stream
   - *Mitigation*: Use `getTask()` backfill pattern from `a2a-client-protocol.int.test.ts`

4. **MMDT SDK Updates**: SDK updates may change delegation signing flow
   - *Mitigation*: Pin SDK version and update test when upgrading dependencies

5. **Timeout Issues**: Complex async flow may hit timeout limits
   - *Mitigation*: Use appropriate timeouts and implement proper stream cleanup

6. **Network Dependency**: Wallet upgrade requires real Arbitrum network access
   - *Mitigation*: Check wallet upgrade status before attempting; skip upgrade if already done
   - *Mitigation*: Provide clear error message if network is unavailable
   - *Mitigation*: Consider running as e2e test in CI with network access

7. **Gas Cost Variability**: Wallet upgrade gas costs may vary with network congestion
   - *Mitigation*: Ensure test wallet is sufficiently funded (0.01 ETH recommended)
   - *Mitigation*: Document gas requirements in test setup instructions

8. **Wallet State Persistence**: Upgraded wallet state persists across test runs
   - *Mitigation*: Check upgrade status before attempting upgrade
   - *Impact*: First run slower (upgrade tx), subsequent runs fast (skip upgrade)

## Architectural Decisions

### Decision 1: Hybrid Integration Test Approach

- **What**: Create a hybrid integration test where wallet upgrade is a real blockchain transaction, but workflow operations are mocked
- **Why**:
  - Validates real wallet upgrade flow with MMDT SDK (critical integration point)
  - Fast workflow execution via mocking (no waiting for approve/supply confirmations)
  - Minimal gas cost (only wallet upgrade, one-time)
  - More reliable than full E2E (network dependency only for upgrade)
  - Still validates critical integration points (A2A protocol, MMDT SDK, delegation signing)
  - Wallet upgrade state persists across runs (upgrade once, test many times)
- **Alternatives**:
  - Full E2E test: Requires funded wallets for every run, longer execution, expensive
  - Full integration test (all mocked): Wouldn't validate real wallet upgrade flow
  - Pure unit test: Wouldn't validate integration between components
- **Trade-offs**:
  - Pro: Tests real wallet upgrade, fast workflow execution, minimal cost
  - Pro: Wallet upgrade is one-time cost, subsequent runs are fast
  - Con: Requires network access for wallet upgrade
  - Con: Requires funded test wallet (one-time setup)
  - Con: Requires maintaining mock handlers for workflow operations
- **Requires documentation in rationales.md**: Yes (novel hybrid approach)

### Decision 2: MSW for Blockchain Mocking

- **What**: Use MSW (Mock Service Worker) handlers to intercept and mock all blockchain RPC calls
- **Why**:
  - Consistent with existing test patterns in codebase
  - Allows precise control over responses
  - Enables testing error scenarios
  - Fast and deterministic
- **Alternatives**:
  - Hardhat/Ganache local chain: More overhead, slower, still external dependency
  - Viem test utils: Less comprehensive mocking capabilities
- **Trade-offs**:
  - Pro: Full control, fast, deterministic
  - Con: Requires maintaining handlers as workflow evolves
- **Requires documentation in rationales.md**: No (follows existing patterns)

### Decision 3: MMDT SDK Integration Pattern

- **What**: Use MMDT SDK directly in test client code to mirror real client behavior
- **Why**:
  - Tests realistic client integration with MMDT SDK
  - Validates that workflow-emitted delegations are compatible with MMDT SDK
  - Ensures test exercises the same code paths as production clients
- **Alternatives**:
  - Mock MMDT SDK: Wouldn't validate real integration
  - Manual delegation creation: Wouldn't catch MMDT SDK compatibility issues
- **Trade-offs**:
  - Pro: Tests real integration, catches compatibility issues
  - Con: Test depends on MMDT SDK implementation details
- **Requires documentation in rationales.md**: No (standard integration testing practice)

### Decision 4: Wallet Auto-Upgrade Pattern

- **What**: Test checks if wallet is upgraded and performs upgrade if needed
- **Why**:
  - Makes test resilient to wallet state
  - Tests the upgrade flow that real clients need
  - Validates MMDT SDK upgrade functionality
- **Alternatives**:
  - Assume pre-upgraded: Simpler but less comprehensive
  - Always upgrade: Wasteful and may hit rate limits with mocks
- **Trade-offs**:
  - Pro: Tests realistic scenario, resilient to wallet state
  - Con: Slightly more complex test setup
- **Requires documentation in rationales.md**: No (standard test pattern)

### Decision 5: Separate Test File

- **What**: Create new test file `usdai-strategy-workflow.int.test.ts` rather than adding to existing file
- **Why**:
  - Keeps test files focused and manageable
  - Allows independent evolution of test suites
  - Easier to run specific workflow tests
  - Clear separation between protocol tests and workflow-specific tests
- **Alternatives**:
  - Add to `a2a-client-protocol.int.test.ts`: Would make file too large and unfocused
  - Add to existing workflow tests: No suitable existing file
- **Trade-offs**:
  - Pro: Clear organization, focused tests
  - Con: Some code duplication with similar setup
- **Requires documentation in rationales.md**: No (standard test organization)

## Out of Scope

The following items are explicitly **NOT** included in this PRD:

1. **Real Workflow Transactions**: No actual on-chain approve/supply transactions will be executed (only wallet upgrade is real)
2. **Gas Optimization Testing**: Not validating gas costs or optimization
3. **Transaction Execution Validation**: Not validating the actual execution results of approve/supply transactions (only artifact emission)
4. **Bug Fixes in usdai-strategy.ts**: Any bugs found will be documented separately, not fixed as part of test creation
5. **Performance Benchmarking**: Not measuring performance metrics or establishing benchmarks
6. **Error Scenario Testing**: Not testing workflow error handling (invalid input, failed transactions, etc.) in initial version
7. **Multi-Workflow Testing**: Only testing single workflow execution, not parallel workflows
8. **Network Conditions**: Not testing under various network conditions (latency, packet loss, etc.)
9. **Security Auditing**: Not performing security analysis of delegation mechanism
10. **Cross-Chain Testing**: Only testing Arbitrum (chain 42161), not other chains
11. **Wallet Upgrade Failure Scenarios**: Not testing network failures during wallet upgrade (happy path only)

## Open Questions

1. ~~Should the test perform actual on-chain transactions or use mocked blockchain interactions?~~ **ANSWERED**: Mock all blockchain calls via MSW/test doubles
2. ~~Should the client handle EIP-7702 wallet upgrade automatically or assume it's already upgraded?~~ **ANSWERED**: Auto-upgrade if needed
3. ~~What aspects of the usdai-strategy.ts workflow behavior should we validate?~~ **ANSWERED**: Delegation signing flow, Artifact streaming, Status transitions
4. ~~Should we handle bugs found in usdai-strategy.ts as part of test creation or separately?~~ **ANSWERED**: Document bugs separately
5. **What specific MSW handlers are needed for the workflow?**
   - Need to map all RPC calls made by workflow utilities (approve, supply)
   - Includes: eth_call (token allowance), eth_sendUserOperation, pm_sponsorUserOperation, eth_getUserOperationReceipt
   - **Note**: Wallet upgrade RPC calls will NOT be mocked (real blockchain access)
6. **What is the exact structure of delegations returned by usdai-strategy.ts?**
   - Need to verify delegation format matches MMDT SDK expectations
   - Need to confirm both delegations (approve, supply) are included in artifact
7. ~~How should the test handle wallet upgrade state?~~ **ANSWERED**: Use real blockchain transaction for wallet upgrade
   - Check wallet code on-chain to determine if already upgraded
   - Execute upgrade transaction if needed (real gas cost)
   - Wait for confirmation before proceeding with test
8. **What are the expected artifact IDs and schemas?**
   - Confirm `delegations-to-sign` artifact structure
   - Confirm `transaction-executed` artifact structure
   - Any other artifacts emitted by workflow?

---

## Reference Patterns

### Similar Test Patterns in Codebase

1. **tests/integration/a2a-client-protocol.int.test.ts**
   - Pattern for workflow dispatch and subscription
   - Pattern for handling pause/resume cycles
   - Pattern for artifact collection and validation
   - Pattern for async stream handling with promises

2. **tests/e2e/workflow-lifecycle.e2e.test.ts**
   - Pattern for delegation signing with test account
   - Pattern for artifact schema validation
   - Pattern for multi-pause workflow handling
   - Pattern for using lifecycle test helpers

3. **tests/utils/lifecycle-test-helpers.ts**
   - Utilities for test account management
   - Utilities for delegation signing
   - Utilities for artifact data extraction
   - Schema definitions for validation

### Workflow Plugin Pattern

The `usdai-strategy.ts` workflow follows this pattern:
1. Initial status (working)
2. First pause for input (wallet + amount)
3. Create delegations
4. Emit delegations artifact
5. Second pause for signed delegations
6. Execute transactions using signed delegations
7. Emit transaction artifacts
8. Final status (completed)

### MMDT SDK Usage Pattern

Based on workflow code (`usdai-strategy.ts`):
```typescript
// Create agent's wallet
const agentsWallet = await toMetaMaskSmartAccount({
  client: publicClient,
  implementation: Implementation.Hybrid,
  deployParams: [agentAccount.address, [], [], []],
  deploySalt: '0x',
  signer: { account: agentAccount },
});

// Create delegations
const delegation = createDelegation({
  scope: {
    type: 'functionCall',
    targets: [tokenAddress],
    selectors: ['approve(address, uint256)'],
  },
  to: agentsWallet.address,
  from: userWalletAddress,
  environment: agentsWallet.environment,
});

// Redeem delegations
const redeemCalldata = DelegationManager.encode.redeemDelegations({
  delegations: [[delegation]],
  modes: [ExecutionMode.SingleDefault],
  executions: [[execution]],
});
```

## Test Data Requirements

### Environment Variables (.env.test)

```bash
# EIP-7702 Test Wallet Private Key
# WARNING: This wallet must have sufficient ETH on Arbitrum for wallet upgrade gas
# Recommended: 0.01 ETH minimum (upgrade is one-time cost)
A2A_TEST_7702_PRIVATE_KEY=0x... (64 hex chars)

# Agent Node Test Private Key
A2A_TEST_AGENT_NODE_PRIVATE_KEY=0x... (64 hex chars)

# Test Chain ID (Arbitrum One)
A2A_TEST_CHAIN_ID=42161

# Arbitrum RPC URL (for real wallet upgrade transaction)
ARBITRUM_RPC_URL=https://arb-mainnet.g.alchemy.com/v2/... (or other provider)

# Pimlico API URL (for bundler/paymaster services)
PIMLICO_URL=https://api.pimlico.io/v2/42161/rpc?apikey=...
```

### Test Constants

```typescript
// USDai token on Arbitrum
const USDAI_TOKEN = {
  address: '0x0a1a1a107e45b7ced86833863f482bc5f4ed82ef',
  decimals: 18,
};

// Pendle swap contract
const PENDLE_SWAP = {
  address: '0x888888888889758F76e7103c6CbF23ABbF58F946',
  selector: '0x12599ac6',
  usdAiPool: '0x8e101c690390de722163d4dc3f76043bebbbcadd',
};

// Test input
const TEST_AMOUNT = '1000'; // 1000 USDai
```

### MSW Mock Data

Mock responses needed for workflow operations (approve, supply):
- `eth_call` (token allowance) → `0x0` (no allowance)
- `eth_call` (token balance) → sufficient balance hex
- `eth_sendUserOperation` → userOpHash
- `eth_getUserOperationReceipt` → receipt with success status
- `pm_sponsorUserOperation` → paymaster data

**NOT mocked** (real blockchain calls for wallet upgrade):
- `eth_chainId` → Real Arbitrum response
- `eth_getCode` → Real code check for wallet upgrade status
- `eth_sendUserOperation` (wallet upgrade) → Real transaction
- `eth_getUserOperationReceipt` (wallet upgrade) → Real receipt

## Appendix

### Glossary

- **A2A Protocol**: Agent-to-Agent communication protocol for workflow streaming
- **EIP-7702**: Ethereum Improvement Proposal for account delegation
- **MMDT**: MetaMask Delegation Toolkit - SDK for managing EIP-7702 delegations
- **MSW**: Mock Service Worker - library for intercepting network requests
- **User Operation**: EIP-4337 account abstraction transaction format
- **Delegation**: Authorization for one account to act on behalf of another
- **Bundler**: Service that submits user operations to blockchain
- **Paymaster**: Service that sponsors gas fees for user operations
- **Pimlico**: Infrastructure provider for account abstraction services

### Related Documents

- `.vibecode/test-workflow-lifecycle/scratchpad.md` - Troubleshooting notes and learnings
- `tests/fixtures/workflows/usdai-strategy.ts` - Workflow plugin being tested
- `tests/integration/a2a-client-protocol.int.test.ts` - Reference test pattern
- `tests/e2e/workflow-lifecycle.e2e.test.ts` - Reference E2E test
- `tests/utils/lifecycle-test-helpers.ts` - Test utilities

### Workflow Sequence Diagram

```
Client                    A2A Server              Workflow (usdai-strategy)
  |                           |                            |
  |--sendMessageStream()----->|                            |
  |                           |--dispatch workflow-------->|
  |<--task event--------------|                            |
  |<--status: working---------|<--status: working----------|
  |                           |                            |
  |--resubscribeTask()------->|                            |
  |                           |                            |
  |<--status: input-req-------|<--pause (wallet input)-----|
  |                           |                            |
  |--sendMessage(wallet)----->|--resume------------------->|
  |                           |                            |
  |<--artifact: delegations---|<--delegations artifact-----|
  |<--status: input-req-------|<--pause (sign delegs)------|
  |                           |                            |
  | [sign delegations]        |                            |
  |                           |                            |
  |--sendMessage(signed)----->|--resume------------------->|
  |                           |                            |
  |<--artifact: tx-executed---|<--tx artifact--------------|
  |<--status: completed-------|<--status: completed--------|
```

---

**PRD Status**: Draft - Awaiting User Approval

**Next Steps After Approval**:
1. Create MSW handlers for blockchain RPC mocking
2. Implement test file following patterns from `a2a-client-protocol.int.test.ts`
3. Add MMDT SDK integration for wallet upgrade and delegation signing
4. Create artifact validation schemas
5. Document any bugs found in `usdai-strategy.ts` separately
6. Run test and iterate until passing

## Current Findings (Streaming)

- Server-side WorkflowHandler correctly publishes child `status-update` and `artifact-update` events and persists them before streaming. Instrumentation of the SDK `tasks/resubscribe` handler confirms those events are iterated and yielded by the server
- Client-side `resubscribeTask()` stream currently receives only the initial `task` event for the USDai workflow path (while the child-stream stub test demonstrates the expected behavior with the same SDK pipeline)
- Adjusting the test to backfill with `getTask()` before `resubscribeTask()` and consuming `artifact-update` (SDK shape) did not resolve the gap

### Additional Validation

- Direct handler test (no HTTP) proves runtime→handler→bus→resubscribe works:
  - File: `tests/integration/workflow-handler-resubscribe.int.test.ts` (PASS)
  - Uses DefaultRequestHandler.resubscribe() to stream updates after WorkflowHandler.dispatchWorkflow()

- Deterministic HTTP/SSE harness (stubbed AI provider):
  - File: `tests/integration/pause-only-workflow-http.int.test.ts`
  - Injected AIService stub emits a single tool-call for `dispatch_workflow_pause_only`
  - Server logs show parent reference status with `referenceTaskIds` and subsequent completed status are published
  - Client parent stream currently doesn’t surface the reference status event → childTaskId not observed → test times out

## Action Plan (Streaming Fix)

1. Align WorkflowHandler dispatch ordering precisely with the working stub (`workflow-child-stream.int.test.ts`):
   - Create child bus → start persistence loop → publish child `task` (persist) → flush buffered `status-update`/`artifact-update`
   - Avoid publishing `message` events to the child bus while active (queue stops on `message`)
2. Validate A2AExpressApp JSON-RPC SSE framing for `tasks/resubscribe` yields each server event as an SSE `data: { jsonrpc, id, result }` envelope
3. Add a raw SSE capture (using `fetch`) for `message/stream` and `tasks/resubscribe` to confirm wire payloads contain the expected JSON-RPC frames and that `id` matches the original request id
4. Evaluate whether the parent stream finishes too quickly after emitting the reference status; if so, add a short drain window before finalization in the server request handler to avoid dropping frames in-flight
5. Once fixed, re-run USDai workflow test to verify:
   - Two pause cycles stream to the client (input-required → working → input-required → working)
   - Delegation artifact (`delegations-to-sign`) appears as `artifact-update`
   - Final transaction artifacts and `completed` status stream and persist

### Risks / Considerations

- ExecutionEventQueue semantics: stream stops on `message` or `status-update` with `final: true` — ensure no stray `message` events are published to the child bus while active
- Client JSON-RPC frame id mismatch could silently drop frames; ensure server uses the same request id for all streamed responses
- Timing/race: parent stream may end immediately after sending completion; add a short delay after publishing completed status to guarantee the reference status reaches the client iterator

### Ownership Handoff

- Context branch: `test/workflow-lifecycle`
- Key files to inspect next:
  - Server SSE packaging: `node_modules/@a2a-js/sdk/dist/server/express/index.js`, `.../index.cjs` (A2AExpressApp)
  - Client SSE parsing: `node_modules/@a2a-js/sdk/dist/client/index.cjs` (`_parseA2ASseStream`)
  - Parent stream publishing: `src/a2a/handlers/streaming/StreamProcessor.ts`
  - Workflow to child bus: `src/a2a/handlers/workflowHandler.ts`

### Definition of Done

- Pause-only HTTP SSE test passes: `tests/integration/pause-only-workflow-http.int.test.ts`
- USDai workflow integration passes: `tests/integration/usdai-strategy-workflow.int.test.ts`
- Both tests show status transitions and artifacts as specified in Success Criteria
