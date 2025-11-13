# A2A Session Reconnection Feature

## Overview

This feature enables automatic reconnection to A2A streaming sessions that were interrupted or not completed. When you switch to a tab with an incomplete task, the system will automatically attempt to reconnect to the stream and resume receiving updates.

## Key Features

### 1. Automatic Reconnection Detection

- When switching to a session, the system checks if reconnection is needed
- Reconnection is triggered for sessions with status `working` or `waiting` that are not currently processing
- Works with sessions that have a stored `contextId` and `agentEndpoint`

### 2. Session Persistence

- Sessions are stored in localStorage with their `contextId` and `agentEndpoint`
- When the app reloads, incomplete sessions are automatically restored
- On page load, if the active session needs reconnection, it will automatically attempt to reconnect

### 3. Visual Feedback

- Sessions in "connecting" status show a "Reconnecting..." indicator in the sidebar
- Each session displays a status icon (●, ◐, ◉, etc.) indicating its current state
- Sessions can be individually closed or switched between

## Implementation Details

### Modified Files

1. **`src/lib/hooks/useA2ASession.ts`**
   - Added `reconnectToStream()` function
   - Sends empty message with `reconnect: true` metadata to resume stream
   - Uses existing `contextId` to identify the session on the server

2. **`src/lib/hooks/useSessionManager.ts`**
   - Added `setSessionAgentEndpoint()` to store agent endpoint per session
   - Enables reconnection without global state

3. **`src/app/page.tsx`**
   - Added reconnection logic in `handleSwitchSession()`
   - Added auto-reconnection on page load for incomplete sessions
   - Stores `agentEndpoint` in sessions when connecting or sending messages

4. **`src/components/AppSidebar.tsx`**
   - Added sessions list with status indicators
   - Shows "Reconnecting..." state for sessions being reconnected
   - Allows switching between sessions and creating new ones

### Session Lifecycle

```
1. User sends message → Session status: "working"
2. Session stores contextId and agentEndpoint
3. User closes tab/refreshes → Session persists to localStorage
4. User opens tab again → App detects incomplete session
5. App calls reconnectToStream() → Session status: "connecting"
6. Server resumes stream → Session status returns to "working"
7. Task completes → Session status: "active"
```

## Testing Instructions

### Test Case 1: Manual Reconnection by Switching Sessions

1. **Setup:**
   - Start the application and connect to an A2A agent
   - Send a message that takes some time to complete (e.g., a complex task)

2. **Create New Session:**
   - Click "New Session" in the sidebar while the first task is still running
   - This will switch to a new empty session

3. **Switch Back:**
   - Click on the first session in the sidebar
   - The app should detect that the session is incomplete and automatically reconnect
   - You should see "Reconnecting..." in the session item
   - Stream should resume and continue showing progress

### Test Case 2: Automatic Reconnection on Page Reload

1. **Setup:**
   - Start the application and connect to an A2A agent
   - Send a message that takes a long time to complete

2. **Reload Page:**
   - Refresh the browser (Cmd+R / Ctrl+R)
   - The app will restore the session from localStorage

3. **Verify Reconnection:**
   - The session should show in the sidebar with "working" or "connecting" status
   - The app should automatically attempt to reconnect
   - Stream should resume and continue showing progress

### Test Case 3: Multiple Sessions with Mixed States

1. **Setup:**
   - Create multiple sessions
   - Start tasks in some sessions, leave others idle

2. **Verify Behavior:**
   - Switch between sessions - only incomplete ones should trigger reconnection
   - Idle sessions should not attempt reconnection
   - Completed sessions should show complete status without reconnecting

### Expected Behavior

#### Successful Reconnection

- Session status changes from "working" → "connecting" → "working"
- Messages continue streaming in the chat
- No duplicate messages or lost context

#### Failed Reconnection

- Session status changes to "error"
- Error message is displayed in the chat
- User can retry by switching away and back to the session

## Debug Logs

The reconnection process is logged to the debug console:

```
[Main] Reconnecting to session: conv-1234567890-abc123
[A2ASession] Reconnecting to stream for session: conv-1234567890-abc123
[A2ASession] Reconnect Event: status-update for session: conv-1234567890-abc123
[A2ASession] Reconnection stream ended for session: conv-1234567890-abc123
```

View logs by clicking "Debug Console" in the sidebar.

## API Requirements

The A2A server must support:

- Resuming streams using the `contextId` parameter
- Returning current task status when reconnecting
- Streaming remaining artifacts/updates for incomplete tasks

## Limitations

1. **Server Support:** The server must support reconnection to existing tasks using `contextId`
2. **Context Expiry:** If the server has cleared the context, reconnection will fail
3. **Message History:** Only messages stored in the session are displayed; historical messages from before session creation are not fetched

## Future Enhancements

- Add manual "Reconnect" button for failed connections
- Show reconnection retry count and backoff
- Add notification when reconnection succeeds/fails
- Support reconnecting to multiple sessions simultaneously
- Add session export/import for cross-device continuity
