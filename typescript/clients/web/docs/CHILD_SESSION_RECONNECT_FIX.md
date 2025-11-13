# Child Session Reconnection Fix

## Issue

Child task sessions were not establishing their own A2A connections after being created. The child tab would be created but would not stream any artifacts or updates from the workflow.

## Root Cause

The problem was a race condition with async state updates:

1. When `handleChildTask()` creates a child session, it performs multiple state updates:
   - Creates new session
   - Sets contextId
   - Sets agentEndpoint
   - Adds task
   - Updates status
   - Switches to session

2. All these state updates are asynchronous (they queue state changes)

3. When `switchSession()` changes `activeSessionId`, it triggers the auto-reconnect `useEffect`

4. **However**, at that moment, the session state might not be fully updated yet - the contextId, agentEndpoint, and tasks might not be set yet

5. The auto-reconnect logic checks `if (!session.contextId)` and returns early, never establishing the connection

## Solution

Instead of relying on the auto-reconnect `useEffect`, `handleChildTask()` now **explicitly calls** `reconnectToStream()` after setting up the session:

```typescript
// Switch to the new child task session first
switchSession(childSessionId);

// Explicitly reconnect to the child task stream
// Use setTimeout to ensure state updates have been applied
setTimeout(() => {
  reconnectToStream({
    sessionId: childSessionId,
    agentEndpoint: parentAgentEndpoint,
    contextId: contextId,
    taskId: childTaskId,
    // ... all callbacks
  });
}, 100); // Small delay to ensure state updates are applied
```

### Key Changes:

1. **Explicit Reconnection**: Calls `reconnectToStream()` directly instead of relying on auto-reconnect
2. **100ms Delay**: Uses `setTimeout` to ensure all state updates have been applied
3. **Direct Parameters**: Passes contextId, taskId, and agentEndpoint directly (not from session state)
4. **Full Callbacks**: Sets up all necessary callbacks for messages, status, artifacts, etc.
5. **Status Indicator**: Sets session to 'connecting' initially so users see the connection in progress

## Benefits

1. **Guaranteed Connection**: Child sessions always connect, regardless of state update timing
2. **Immediate Feedback**: Session status shows 'connecting' while establishing connection
3. **Proper Error Handling**: If reconnection fails, callbacks handle errors appropriately
4. **Nested Workflows**: Supports recursive child task detection (workflows that spawn workflows)

## Files Changed

- `src/app/page.tsx`
  - Updated `handleChildTask()` to explicitly call `reconnectToStream()`
  - Added dependencies: `reconnectToStream`, `addMessageToSession`, `updateMessageInSession`, `updateTaskState`, `mapA2AStateToTaskState`
  - Added 100ms timeout for state stabilization

## Testing

To verify the fix:

1. Dispatch a workflow that creates a child task
2. Observe that a new tab is created immediately
3. Check that the tab shows "connecting" status briefly
4. Verify that artifacts start streaming into the child tab
5. Confirm that all workflow events (status updates, artifacts, input-required, etc.) are received

## Related Issues

This fix ensures that the complete workflow dispatch flow works end-to-end:

- ✅ Parent dispatches workflow
- ✅ Child session created
- ✅ **Child session connects to A2A** (FIXED)
- ✅ Artifacts stream and render
- ✅ Bidirectional communication works
- ✅ Workflow completes successfully

## Date

October 21, 2025
