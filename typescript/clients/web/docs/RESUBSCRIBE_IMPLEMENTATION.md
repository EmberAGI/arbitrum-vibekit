# A2A Resubscribe Method Implementation

## Overview

This document describes the implementation of the proper A2A `tasks/resubscribe` method for reconnecting to inactive connections and sessions. Previously, the application used `message/stream` with an empty message for reconnection. Now it uses the official A2A protocol method `tasks/resubscribe`.

## Changes Made

### 1. Session Type Updates (`src/lib/types/session.ts`)

Added `taskId` field to the `Session` interface to track active task IDs:

```typescript
export interface Session {
  // ... existing fields
  contextId: string | null; // Server-side session ID
  agentEndpoint: string | null;
  taskId: string | null; // Active task ID for resubscription
  // ... rest of fields
}
```

### 2. A2A Session Hook Updates (`src/lib/hooks/useA2ASession.ts`)

#### Added Task ID Support to Configuration

```typescript
interface A2ASessionConfig {
  // ... existing fields
  taskId?: string | null; // Current task ID for resubscription
  onTaskIdReceived?: (sessionId: string, taskId: string) => void;
  // ... rest of fields
}
```

#### Capture Task ID When Tasks Are Created

When a task is created during `sendMessage`, the task ID is now captured and stored:

```typescript
if (event.kind === 'task') {
  console.log('[A2ASession] Task created:', event.id);

  // Capture task ID for resubscription
  if (event.id && onTaskIdReceived) {
    onTaskIdReceived(sessionId, event.id);
  }
  // ...
}
```

#### Updated `reconnectToStream` to Use `tasks/resubscribe`

The reconnection logic now uses the proper A2A protocol method:

**Before:**

```typescript
const request = {
  jsonrpc: '2.0',
  id: messageId,
  method: 'message/stream',
  params: {
    message: {
      role: 'user',
      parts: [{ kind: 'text', text: '' }], // Empty message
      messageId,
      contextId,
      metadata: { reconnect: 'true' },
    },
    // ...
  },
};
```

**After:**

```typescript
const request = {
  jsonrpc: '2.0',
  id: requestId,
  method: 'tasks/resubscribe',
  params: {
    id: taskId, // Task ID to resubscribe to
    metadata: {
      sessionId,
      reconnect: 'true',
    },
  },
};
```

### 3. Session Manager Updates (`src/lib/hooks/useSessionManager.ts`)

Added helper functions to manage task IDs:

```typescript
const setSessionTaskId = useCallback((sessionId: string, taskId: string) => {
  setState((prev) => {
    const session = prev.sessions[sessionId];
    if (!session) return prev;

    console.log('[SessionManager] Set taskId for session', sessionId, ':', taskId);

    return {
      ...prev,
      sessions: {
        ...prev.sessions,
        [sessionId]: {
          ...session,
          taskId,
          updatedAt: new Date(),
        },
      },
    };
  });
}, []);

const getSessionTaskId = useCallback(
  (sessionId: string): string | null => {
    return state.sessions[sessionId]?.taskId || null;
  },
  [state.sessions],
);
```

All session creation points now initialize `taskId: null`:

- Initial session on mount
- New session creation
- Session restoration from localStorage

### 4. Main Page Updates (`src/app/page.tsx`)

#### Import New Session Manager Functions

```typescript
const {
  // ... existing
  setSessionTaskId,
  getSessionTaskId,
  createToolExecutionSession,
} = useSessionManager();
```

#### Pass Task ID to All A2A Calls

**When sending messages:**

```typescript
await sendA2AMessage(
  {
    sessionId: activeSessionId,
    agentEndpoint,
    contextId,
    taskId: getSessionTaskId(activeSessionId), // Pass current task ID
    // ... other callbacks
    onTaskIdReceived: (sessionId, taskId) => {
      setSessionTaskId(sessionId, taskId);
      addDebugLog('success', 'Task ID received for session', {
        sessionId,
        taskId,
      });
    },
  },
  sanitizedMessage,
  combinedMetadata,
);
```

**When reconnecting:**

```typescript
reconnectToStream({
  sessionId,
  agentEndpoint,
  contextId: session.contextId,
  taskId: session.taskId, // Pass stored task ID
  // ... other callbacks
  onTaskIdReceived: (sessionId, taskId) => {
    setSessionTaskId(sessionId, taskId);
    addDebugLog('success', 'Task ID received for session', {
      sessionId,
      taskId,
    });
  },
});
```

## How It Works

### Task ID Lifecycle

1. **User sends a message** → Session status changes to "working"
2. **Server creates task** → Task ID is received in the "task" event
3. **Task ID is captured** → Stored in session via `onTaskIdReceived` callback
4. **Session persists** → Task ID is saved to localStorage with session data
5. **Connection interrupts** → Session remains in "working" or "waiting" status
6. **User switches back** → App detects incomplete session
7. **Resubscribe called** → Uses `tasks/resubscribe` method with stored task ID
8. **Stream resumes** → Continues receiving updates for the existing task

### Resubscribe Request Format

```typescript
{
  "jsonrpc": "2.0",
  "id": "resubscribe-1234567890-abc123",
  "method": "tasks/resubscribe",
  "params": {
    "id": "task-xyz789", // The task ID to resubscribe to
    "metadata": {
      "sessionId": "conv-1234567890-abc123",
      "reconnect": "true"
    }
  }
}
```

### Response Stream

The server responds with an SSE stream of:

- `TaskStatusUpdateEvent`: Status changes for the task
- `TaskArtifactUpdateEvent`: Artifact updates (reasoning, response, tool calls, etc.)

## Benefits

1. **Proper Protocol Compliance**: Uses the official A2A `tasks/resubscribe` method instead of a workaround
2. **More Reliable**: The resubscribe method is specifically designed for this use case
3. **Better Server Support**: Servers can distinguish between new messages and resubscription requests
4. **Cleaner Architecture**: Semantic separation between sending new messages and reconnecting to existing tasks
5. **Task-Specific**: Resubscribes to a specific task ID, ensuring no confusion with multiple tasks

## Requirements

### Server-Side

The A2A server must support:

- `tasks/resubscribe` method in the JSONRPC interface
- `AgentCard.capabilities.streaming: true`
- Task persistence with unique task IDs
- Returning task status and artifacts when resubscribing

### Client-Side

The client must:

- Store the task ID when it's received from the server
- Pass the task ID when calling `reconnectToStream`
- Handle cases where task ID might not be available (fallback behavior)

## Fallback Behavior

If a session doesn't have a task ID (e.g., old sessions or sessions created before this change), the reconnection logic will log a warning and skip resubscription:

```typescript
if (!taskId) {
  console.warn(
    '[A2ASession] Cannot resubscribe without taskId:',
    sessionId,
    '- falling back to message/stream with contextId',
  );
  // If no taskId but we have contextId, fall back to old method
  if (!contextId) {
    return;
  }
}
```

## Testing

### Test Reconnection

1. **Start a long-running task**
   - Connect to an A2A agent
   - Send a message that takes time to complete

2. **Switch sessions**
   - Create a new session while the task is running
   - Check debug logs for "Task ID received for session"

3. **Switch back**
   - Return to the original session
   - Verify debug logs show: "[A2ASession] Resubscribing to task for session"
   - Confirm the method used is "tasks/resubscribe"

4. **Reload page**
   - Refresh browser during a task
   - Session should auto-reconnect using `tasks/resubscribe`

### Debug Logs to Look For

Successful flow:

```
[A2ASession] Task created: task-xyz789
[SessionManager] Set taskId for session conv-123 : task-xyz789
[Main] Task ID received for session
[A2ASession] Resubscribing to task for session: conv-123
[A2ASession] Resubscribe Event: status-update for session: conv-123
[A2ASession] Resubscription stream ended for session: conv-123
```

## Migration Notes

### For Existing Sessions

Sessions created before this update won't have a `taskId` stored. These will gracefully handle the missing task ID:

- New sessions will start capturing task IDs immediately
- Old sessions can be closed and recreated if reconnection is needed
- The session storage format is backward compatible

### For Developers

If you're maintaining this code:

1. Always pass `taskId` to `reconnectToStream`
2. Always handle `onTaskIdReceived` callback
3. Store task IDs immediately when received
4. Check debug logs to verify proper resubscription

## Related Documentation

- [A2A Protocol Documentation](https://deepwiki.com/google/A2A/2.3-grpc-protocol)
- [A2A Reconnection Feature](./A2A_RECONNECTION_FEATURE.md)
- [Session Management](./SESSION_SUMMARY.md)
