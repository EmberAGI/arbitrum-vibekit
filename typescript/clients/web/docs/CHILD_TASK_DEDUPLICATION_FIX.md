# Child Task Deduplication Fix

## Problem

When dispatching a workflow that spawns child tasks, the server was sending **multiple status-update events** with `referenceTaskIds`, resulting in:

1. **4 duplicate tabs** being created for a single workflow dispatch
2. **Empty tabs** with no connection attempts
3. Confusion about which child task should actually be resubscribed to

### Example Server Response

```json
// Event 1
{"kind":"status-update","status":{"message":{"referenceTaskIds":["task-019a0471-5b10-7505-9b3f-eb18dbde0dc8"]}}}

// Event 2
{"kind":"status-update","status":{"message":{"referenceTaskIds":["task-019a0471-5b13-7093-a253-40776b8d8ae0"]}}}

// Event 3
{"kind":"status-update","status":{"message":{"referenceTaskIds":["task-019a0471-5b18-75f5-93bb-943e9259842a"]}}}

// Event 4
{"kind":"status-update","status":{"message":{"referenceTaskIds":["task-019a0471-5b1d-7249-a10c-92cb505f7b4a"]}}}
```

Each event triggered `handleChildTask`, creating 4 separate tabs.

## Root Cause

The child task detection logic was **not deduplicating** child tasks. Every `status-update` event with `referenceTaskIds` would:

1. Trigger `onChildTaskDetected` callback
2. Call `handleChildTask`
3. Create a new session/tab
4. Attempt to resubscribe to that child task

With multiple events for what appears to be the same workflow, this resulted in duplicate tabs.

## Solution

### 1. Deduplicate Child Tasks Using `useRef`

Added a `processedChildTasksRef` to track which child task IDs have already been handled:

```typescript
// In src/app/page.tsx
const processedChildTasksRef = useRef<Set<string>>(new Set());
```

### 2. Check Before Processing

Updated `handleChildTask` to check if a child task has already been processed:

```typescript
const handleChildTask = useCallback(
  (parentSessionId: string, childTaskId: string, contextId: string, metadata?: any) => {
    // Check if we've already processed this child task
    if (processedChildTasksRef.current.has(childTaskId)) {
      console.log('[Main] Child task already processed, skipping:', childTaskId);
      return;
    }

    // Mark this child task as processed
    processedChildTasksRef.current.add(childTaskId);

    // ... rest of the function
  },
  [
    /* dependencies */
  ],
);
```

### 3. Enhanced Logging

Added comprehensive logging throughout the child task handling pipeline:

#### In `page.tsx`:

```typescript
console.log('[Main] Preparing to resubscribe to child task:', {
  childSessionId,
  childTaskId,
  contextId,
  agentEndpoint: parentSession.agentEndpoint,
});

// After setTimeout
console.log('[Main] Executing resubscribe to child task:', childTaskId);
```

#### In `useA2ASession.ts`:

```typescript
console.log('[A2ASession] Resubscribing to task for session:', sessionId, {
  taskId,
  contextId,
  agentEndpoint,
});

console.log('[A2ASession] Sending resubscribe request:', JSON.stringify(request, null, 2));

console.log('[A2ASession] Resubscribe response received, status:', response.status);
```

## Implementation Details

### Files Modified

1. **src/app/page.tsx**
   - Added `processedChildTasksRef` to track processed child tasks
   - Updated `handleChildTask` to check and mark processed tasks
   - Enhanced logging for child task creation and resubscription

2. **src/lib/hooks/useA2ASession.ts**
   - Added detailed logging for resubscribe requests
   - Enhanced error logging with response body content
   - Added status logging for successful resubscribe responses

### Key Changes

```typescript
// Before: Multiple tabs created for same workflow
handleChildTask() -> creates tab 1
handleChildTask() -> creates tab 2
handleChildTask() -> creates tab 3
handleChildTask() -> creates tab 4

// After: Only first child task creates a tab
handleChildTask() -> creates tab 1
handleChildTask() -> skipped (already processed)
handleChildTask() -> skipped (already processed)
handleChildTask() -> skipped (already processed)
```

## Expected Behavior

### Workflow Dispatch Flow

```
User sends "dispatch workflow"
    ↓
Parent task processes
    ↓
Server sends multiple status-updates with child task IDs
    ↓
First child task detected
    ↓
New session created: "USDAi Points Trading Strategy"
    ↓
Child task marked as processed in Set
    ↓
Child session configured:
  - contextId set from parent
  - agentEndpoint set from parent
  - Task added with 'working' state
  - Session status set to 'working'
    ↓
switchSession(childSessionId) called
    ↓
handleSwitchSession detects session needs reconnection
    ↓
Auto-reconnect triggered via getLatestIncompleteTaskId
    ↓
Resubscribe request sent for child task
    ↓
Artifacts received (custom components)
    ↓
Subsequent duplicate events ignored
```

### Console Output

```
[Main] Child task already processed, skipping: task-019a0471-5b13-7093-a253-40776b8d8ae0
[Main] Child task already processed, skipping: task-019a0471-5b18-75f5-93bb-943e9259842a
[Main] Child task already processed, skipping: task-019a0471-5b1d-7249-a10c-92cb505f7b4a
```

## Testing

To verify the fix:

1. **Dispatch a workflow** that spawns child tasks
2. **Verify** only ONE new tab is created (not 4)
3. **Check console** for "already processed" messages for duplicates
4. **Confirm** the child tab receives artifacts via resubscription
5. **Inspect** the resubscribe request/response logs

### Expected Logs

```
[Main] Creating child task session: {childTaskId: "task-...", ...}
[Main] Preparing to resubscribe to child task: {...}
[Main] Executing resubscribe to child task: task-...
[A2ASession] Resubscribing to task for session: {...}
[A2ASession] Sending resubscribe request: {"jsonrpc":"2.0",...}
[A2ASession] Resubscribe response received, status: 200
```

## Notes

### Why Multiple Child Tasks?

The server may send multiple status-updates with different child task IDs for various reasons:

- Multiple parallel workflow executions
- Broadcasting to multiple listeners
- Server-side duplication/redundancy
- Different stages of workflow dispatch

Our client-side deduplication ensures only the **first unique child task ID** creates a new session, regardless of how many duplicate or related events arrive.

### Persistence

The `processedChildTasksRef` persists across renders but is **reset on page reload**. This is intentional because:

- Child tasks are ephemeral (tied to a specific parent task execution)
- On reload, no new child task events will arrive
- Reloaded child sessions will use normal resubscription (not creation)

### Future Considerations

If the server behavior changes to send only one child task reference per workflow, this deduplication will still work correctly - it simply won't filter out any duplicates.

If we need to support **multiple legitimate child tasks** from a single workflow (e.g., a workflow that spawns 3 parallel sub-workflows), the current implementation will correctly create 3 separate tabs, one for each unique child task ID.

## Auto-Reconnect Fix (Update)

### Issue

Initially, child sessions were created but the reconnection wasn't being triggered. The child tabs appeared empty with no A2A communication.

### Root Cause

When creating a child session, we were:

1. Adding the task to the session ✅
2. Setting contextId and agentEndpoint ✅
3. BUT NOT setting the session status ❌

Without `session.status = 'working'`, the auto-reconnect logic in `handleSwitchSession` wouldn't trigger because it checks:

```typescript
if (session.status === 'working' || session.status === 'waiting') {
  // trigger reconnect
}
```

### Solution

Added `updateSessionStatus(childSessionId, 'working')` before switching to the child session:

```typescript
// Add the child task to the session
addTask(childSessionId, childTaskId, 'working');

// Set session status to 'working' so auto-reconnect triggers
updateSessionStatus(childSessionId, 'working');

// Switch to the new child task session - this triggers auto-reconnect
switchSession(childSessionId);
```

### Result

Now when switching to a child session, `handleSwitchSession` detects:

- ✅ Session has contextId
- ✅ Session has agentEndpoint
- ✅ Session has tasks (length > 0)
- ✅ Session status is 'working'
- ✅ Session is not already processing

This triggers the auto-reconnect with `getLatestIncompleteTaskId(sessionId)`, which returns the child task ID, and the resubscribe request is sent automatically.

## Related Documentation

- [Child Task Handling](./CHILD_TASK_HANDLING.md) - Original implementation
- [Multi-Task Per Session](./MULTI_TASK_PER_SESSION.md) - Task tracking architecture
- [Resubscribe Implementation](./RESUBSCRIBE_IMPLEMENTATION.md) - A2A resubscription method
