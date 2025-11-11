# Workflow Dispatch Implementation

## Overview

This document describes the implementation of the workflow dispatch feature, which enables the FE to properly handle dispatched workflows, create child task sessions, reconnect to workflow streams, and render workflow artifacts.

## Implementation Date

October 21, 2025

## Key Changes

### 1. Enhanced Artifact Handling in `useA2ASession`

**File**: `src/lib/hooks/useA2ASession.ts`

#### Changes Made:

1. **Capture ALL Data Artifacts** (not just `tool-call-*` artifacts)
   - Previously, only artifacts with IDs starting with `tool-call-` were captured
   - Now, ALL artifacts with `kind: "data"` parts are captured and stored
   - Workflow artifacts like `delegations-display`, `strategy-dashboard-display`, etc. are now properly captured

2. **Improved Artifact Identification**
   - Tool-call artifacts: Use `toolName` extracted from `tool-call-{name}` format
   - Workflow artifacts: Use `artifactId` as the `toolName` for rendering

3. **Fixed Append Mode Handling**
   - Properly checks `event.append` flag (not `artifact.append`)
   - When `append: false`: Clears existing artifact with the same ID
   - When `append: true`: Intelligently merges data:
     - **Arrays**: Appends new items to existing array: `[...existing, ...new]`
     - **Objects**: Merges properties: `{ ...existing, ...new }`
     - **Mixed types**: Wraps in array: `[existing, ...new]`

4. **Applied to Both Functions**
   - Changes applied to `sendMessage()` function
   - Changes applied to `reconnectToStream()` function
   - Ensures consistent behavior across initial connections and reconnections

### 2. Workflow Dispatch Flow

Based on the success flow logs, the workflow dispatch process works as follows:

#### Step 1: Parent Task Dispatches Workflow

- User sends a message to dispatch a workflow (e.g., "USDAI Strategy Workflow")
- Parent task creates a child task and returns the child task ID
- Parent receives multiple `artifact-update` events during workflow execution
- Parent task completes with `status: completed`

#### Step 2: Child Task Detection

- When `status-update` event includes `referenceTaskIds`, a child task is detected
- The `handleChildTask` callback is invoked with:
  - `parentSessionId`: The parent session ID
  - `childTaskId`: The child workflow task ID
  - `contextId`: The A2A context ID
  - `metadata`: Workflow metadata (name, description, etc.)

#### Step 3: Child Session Creation

- A new session tab is created for the child task
- Session type: `conversation`
- Session title: Workflow name from metadata
- Context ID and agent endpoint are copied from parent session
- Child task is added to the session with initial state: `working`

#### Step 4: Explicit Reconnection to Child Task

- After creating and setting up the child session, `handleChildTask` explicitly calls `reconnectToStream()`
- Uses `tasks/resubscribe` A2A method with the child task ID
- Subscribes to the child task stream to receive all workflow events
- Note: Explicit reconnection is required because state updates are async and the auto-reconnect logic may fire before the session is fully initialized

#### Step 5: Artifact Streaming

The workflow streams various artifacts that are now properly captured:

1. **Strategy Display** (`strategy-input-display`)
   - Initial strategy information
   - Token, chains, protocol, rewards data

2. **Delegations Display** (`delegations-display`, `delegations-data`)
   - User-facing delegation descriptions
   - Raw delegation objects for signing

3. **Dashboard Display** (`strategy-dashboard-display`)
   - Strategy performance metrics
   - Cumulative points, total value, etc.

4. **Transaction History** (`transaction-history-display`, `append: true`)
   - Streamed transaction records
   - Appends new transactions as they occur

5. **Settings Display** (`strategy-settings-display`)
   - Strategy configuration settings
   - Allocated amount, daily limits, preferred assets

6. **Policies Display** (`strategy-policies-display`)
   - Active delegation policies
   - Assets and amounts covered

### 3. Artifact Rendering

All workflow artifacts are rendered using the `JsonViewer` component:

1. Artifacts are stored in the message's `artifacts` map
2. Each artifact has:
   - `artifactId`: Unique identifier
   - `toolName`: Display name (artifact ID for workflow artifacts)
   - `output`: The artifact data to render
   - `append`: Whether this artifact supports streaming appends
   - `isLoading`: Whether more data is coming

3. Rendering in UI:
   - `ToolResultRenderer` wraps each artifact
   - For workflow artifacts (non-`tool-call-*`), defaults to `JsonViewer`
   - Displays artifact data in an interactive, collapsible JSON tree

## File Changes

### Modified Files:

1. `src/lib/hooks/useA2ASession.ts`
   - Enhanced artifact-update handling in `sendMessage()`
   - Enhanced artifact-update handling in `reconnectToStream()`
   - Fixed append mode logic for streaming artifacts

2. `src/app/page.tsx`
   - Updated `handleChildTask()` to explicitly call `reconnectToStream()` after creating child session
   - Added 100ms delay to ensure state updates are applied before reconnection
   - Set session status to 'connecting' while establishing connection
   - All callback handlers set up for proper artifact and status handling

## Bidirectional Communication

The workflow supports bidirectional communication via the existing implementation:

1. **Input Required States**
   - Workflow pauses with `status: input-required`
   - Status message includes JSON schema for expected input
   - Session status updates to `waiting` with `awaitingInput: true`

2. **User Interaction**
   - Custom components can trigger `onUserAction` callback
   - `sendToActiveTask()` sends user data to the active task
   - Uses `message/stream` with `kind: "data"` parts
   - Continues workflow execution in same context

3. **Example: Delegation Signing**
   - First pause: Requests wallet address and amount
   - Workflow creates delegation objects
   - Second pause: Requests signed delegations
   - User signs via wallet (or test stubs)
   - Workflow executes transactions with signed delegations

## Testing Notes

### What Should Work:

1. **Workflow Dispatch**
   - Parent task dispatches workflow
   - Child session tab is created automatically
   - Child session shows workflow name as title

2. **Artifact Streaming**
   - All workflow artifacts are captured
   - Artifacts render in JsonViewer
   - Append mode properly accumulates data

3. **Input-Required States**
   - Workflow pauses when input needed
   - JSON schema defines expected input format
   - UI can show input form based on schema

4. **Bidirectional Flow**
   - User provides input data
   - Workflow continues execution
   - Additional artifacts stream in
   - Workflow completes with final state

### Test Workflow:

To test the implementation:

1. Connect to A2A agent (e.g., `https://dev.emberai.xyz`)
2. Send a message to dispatch the USDAI workflow
3. Verify child session tab is created
4. Switch to child session tab
5. Verify artifacts are rendering:
   - `strategy-input-display`
   - `delegations-display` (should show delegation info)
   - `delegations-data` (should show raw delegation objects)
6. If input-required, provide the requested data
7. Verify additional artifacts stream in after input
8. Verify append-mode artifacts accumulate (e.g., transaction history)
9. Verify workflow completes successfully

## Known Limitations

1. **JsonViewer Only**: Currently all workflow artifacts render in JsonViewer. Custom UI components for specific artifact types can be added later.

2. **No Schema-Based Forms**: Input-required states show the JSON schema but don't automatically generate input forms. This can be enhanced in the future.

3. **Test Mode**: The success flow logs are from a test environment with mocked blockchain calls. Real blockchain transactions may have additional considerations.

## Future Enhancements

1. **Custom Artifact Components**
   - Create specialized UI components for common workflow artifacts
   - Examples: DelegationViewer, TransactionHistoryViewer, StrategyDashboard

2. **Schema-Based Input Forms**
   - Auto-generate input forms from JSON schema
   - Validate user input against schema before sending

3. **Workflow Progress Indicators**
   - Visual timeline of workflow stages
   - Progress bars for long-running operations

4. **Artifact Actions**
   - Copy buttons for specific artifact data
   - Export artifact data to clipboard/file
   - Share workflow results

5. **Error Recovery**
   - Graceful handling of workflow failures
   - Retry mechanisms for failed steps
   - Better error messages and debugging info

## Related Documentation

- `docs/success-flow-logs.md` - Success flow logs from test workflow
- `docs/BIDIRECTIONAL_IMPLEMENTATION_SUMMARY.md` - Bidirectional communication implementation
- `docs/RESUBSCRIBE_IMPLEMENTATION.md` - Task resubscription for reconnection
- `docs/MULTI_ARTIFACT_SUPPORT.md` - Multi-artifact rendering support
- `docs/MULTI_TYPE_APPEND_CONFIRMED.md` - Append mode for artifacts

## Summary

The workflow dispatch implementation enables the FE to:

1. ✅ Dispatch workflows via parent task
2. ✅ Detect child tasks and create sessions automatically
3. ✅ **Explicitly reconnect to child task streams** (not relying on auto-reconnect)
4. ✅ Use `tasks/resubscribe` A2A method with proper task ID
5. ✅ Capture ALL workflow artifacts (not just tool-call artifacts)
6. ✅ Handle append mode for streaming artifacts
7. ✅ Render all artifacts using JsonViewer
8. ✅ Support bidirectional communication for input-required states
9. ✅ Complete end-to-end workflow execution

### Critical Fix Applied

**Issue**: Child sessions were not establishing A2A connections because state updates are asynchronous. The auto-reconnect logic would fire before the session had contextId and tasks set up.

**Solution**: `handleChildTask` now explicitly calls `reconnectToStream()` after a 100ms delay to ensure all state updates have been applied. This guarantees the child session properly connects to the workflow stream.

The implementation is ready for testing with a live A2A agent that supports workflow dispatch.
