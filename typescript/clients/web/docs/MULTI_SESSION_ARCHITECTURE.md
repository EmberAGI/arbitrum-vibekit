# Multi-Session Architecture

## Overview

The application now supports multiple concurrent conversations and tool executions as unified "sessions". Each session maintains its own state, messages, and A2A context independently, with full persistence to localStorage and seamless switching between sessions.

## Key Features

1. **Unified Session Model**: Conversations and tool executions are both treated as "sessions"
2. **Multi-Session Management**: Create, view, and switch between multiple active sessions
3. **State Persistence**: All sessions are automatically saved to localStorage
4. **Context Separation**: Each session maintains its own A2A contextId (server-side session)
5. **Status Tracking**: Real-time status indicators for each session
6. **Tool Invocation Detection**: Automatically creates new session tabs when tools are invoked
7. **No Connection Loss**: Switching sessions doesn't disrupt A2A connections

## Architecture Components

### Core Types (`src/lib/types/session.ts`)

#### Session

```typescript
interface Session {
  id: string; // Unique session identifier
  type: SessionType; // 'conversation' | 'tool-execution'
  status: SessionStatus; // Current status (idle, active, working, etc.)
  title: string; // Display name
  createdAt: Date;
  updatedAt: Date;
  lastActivityAt: Date;

  contextId: string | null; // A2A server-side session ID
  agentEndpoint: string | null; // A2A endpoint URL

  messages: SessionMessage[]; // Message history
  toolMetadata?: ToolExecutionMetadata; // For tool-execution sessions

  isMinimized: boolean;
  scrollPosition?: number;
}
```

#### SessionStatus

- `idle`: No activity
- `connecting`: Establishing connection
- `active`: Ready for interaction
- `working`: Processing/executing
- `waiting`: Waiting for response
- `completed`: Successfully completed
- `error`: Error state
- `paused`: Paused/suspended

#### SessionMessage

```typescript
interface SessionMessage {
  id: string;
  sender: 'user' | 'agent' | 'agent-progress' | 'agent-error';
  content: string;
  timestamp: Date;
  validationErrors?: string[];
  isHtml?: boolean;
  isStreaming?: boolean;
  reasoning?: string;
  toolInvocation?: {
    toolName: string;
    input: any;
    output: any;
  };
}
```

### Session Storage (`src/lib/sessionStorage.ts`)

Handles localStorage persistence with proper serialization/deserialization:

- **`saveSessions(state)`**: Save all sessions (max 50)
- **`loadSessions()`**: Load sessions from storage
- **`saveSession(session)`**: Save a single session (optimized)
- **`deleteSession(sessionId)`**: Remove a session
- **`clearSessions()`**: Clear all stored sessions

### Session Manager Hook (`src/lib/hooks/useSessionManager.ts`)

Central orchestrator for session state management:

```typescript
const {
  // State
  sessions, // All sessions by ID
  activeSessionId, // Currently active session
  activeSession, // Active session object
  sessionOrder, // Order for sidebar display

  // Session management
  createSession,
  switchSession,
  closeSession,
  updateSessionStatus,
  updateSessionTitle,

  // Message management
  addMessageToSession,
  updateMessageInSession,

  // Context management
  setSessionContextId,
  getSessionContextId,

  // Tool execution
  createToolExecutionSession,
} = useSessionManager();
```

**Key Features:**

- Auto-loads sessions from localStorage on mount
- Creates initial conversation if no saved sessions
- Auto-saves with 1-second debouncing
- Prevents closing the last session (creates a new one)
- Manages session order for sidebar display

### A2A Session Hook (`src/lib/hooks/useA2ASession.ts`)

Session-aware wrapper around A2A protocol communication:

```typescript
const { sendMessage, isProcessing } = useA2ASession();

await sendMessage(
  {
    sessionId, // Which session to send from
    agentEndpoint, // A2A endpoint URL
    contextId, // Server-side session ID (or null for first message)
    onMessage, // Callback for message updates
    onStatusUpdate, // Callback for status changes
    onContextIdReceived, // Callback when server provides contextId
    onToolInvocation, // Callback for tool invocations
  },
  messageText,
  metadata,
);
```

**Key Features:**

- Manages multiple concurrent A2A streams
- Properly includes/omits contextId (first message doesn't include it)
- Handles SSE streaming
- Processes artifacts, status updates, and tool invocations
- Supports aborting requests per session

### Updated AppSidebar (`src/components/AppSidebar.tsx`)

Now displays sessions in two collapsible sections:

#### "Action Required" Section

Shows tool executions that need attention:

- Status: `working`, `waiting`, or `error`
- Displays with pulsing colored dot indicators
- Click to switch to that session

#### "Live" Section

Shows all active conversations and completed tool executions:

- Conversations with message count
- Tool executions with description
- Color-coded status indicators
- Click to switch, hover to close

**Visual Design:**

- Colored status dots (red, orange, yellow, green, gray)
- Truncated titles and descriptions
- Active session highlighted with orange border
- Hover reveals close button

### Updated Main Page (`src/app/page.tsx`)

Integrated with session management:

1. **Session Initialization**:
   - Uses `useSessionManager()` for state
   - Uses `useA2ASession()` for communication
   - Automatically loads saved sessions

2. **Message Handling**:
   - Messages tied to specific sessions
   - Active session determines what's displayed
   - Switching sessions changes view instantly

3. **Tool Invocation Detection**:
   - When `status-update` includes `referencedWorkflow`
   - Automatically creates new tool-execution session
   - Links to parent conversation session
   - Updates status based on task state

4. **Context Preservation**:
   - Each session maintains its own `contextId`
   - Switching sessions doesn't clear state
   - A2A connection remains active
   - No reconnections needed

## User Flows

### Starting a Conversation

1. App loads with initial conversation session
2. User connects to A2A agent
3. User sends first message
4. Server responds with `contextId` → stored in session
5. Subsequent messages include `contextId`

### Tool Invocation

1. Agent processes message and invokes tool
2. Status update includes `referencedWorkflow` metadata
3. New tool-execution session auto-created
4. Appears in sidebar "Action Required" section
5. Click to view tool execution progress
6. Original conversation continues independently

### Switching Sessions

1. Click any session in sidebar
2. `switchSession(sessionId)` called
3. Active session changes → UI updates
4. Messages from new session displayed
5. Input tied to new session
6. Previous session state preserved

### Closing Sessions

1. Hover over session → close button appears
2. Click close → `closeSession(sessionId)` called
3. Session removed from state and storage
4. If active, switches to another session
5. If last session, creates new conversation

## Status Color Mapping

```typescript
const STATUS_COLORS = {
  idle: { bg: 'gray', text: 'gray-400', icon: '○' },
  connecting: { bg: 'blue', text: 'blue-400', icon: '◐' },
  active: { bg: 'green', text: 'green-400', icon: '●' },
  working: { bg: 'orange', text: 'orange-400', icon: '◉' },
  waiting: { bg: 'yellow', text: 'yellow-400', icon: '◎' },
  completed: { bg: 'green', text: 'green-400', icon: '✓' },
  error: { bg: 'red', text: 'red-400', icon: '✗' },
  paused: { bg: 'gray', text: 'gray-400', icon: '❙❙' },
};
```

## Example: Status Update with Tool Invocation

When the A2A server sends a status update like this:

```typescript
{
  kind: 'status-update',
  taskId: 'task-123',
  contextId: 'ctx-456',
  status: {
    state: 'working',
    message: {
      kind: 'message',
      messageId: 'msg-789',
      contextId: 'ctx-456',
      role: 'agent',
      referenceTaskIds: ['task-result-123'],
      parts: [
        {
          kind: 'text',
          text: 'Dispatching workflow: Pendle Farm Deposit (Deposit USDai to Pendle Farm 3)',
        },
      ],
      metadata: {
        referencedWorkflow: {
          workflowName: 'Pendle Farm Deposit',
          description: 'Deposit USDai to Pendle Farm 3',
          // ... other metadata
        },
      },
    },
  },
  final: false,
}
```

The application automatically:

1. Detects `metadata.referencedWorkflow`
2. Creates new tool-execution session:
   - Title: "Pendle Farm Deposit"
   - Description: "Deposit USDai to Pendle Farm 3"
   - Status: "working"
   - Parent: current conversation session
3. Adds to sidebar "Action Required" section
4. User can click to view live progress

## Persistence Strategy

### What's Persisted

- All session metadata (id, type, status, title, timestamps)
- Full message history with all fields
- A2A contextId (server-side session reference)
- Tool execution metadata
- Session order for sidebar

### What's NOT Persisted

- Active WebSocket/SSE connections (reconnection not supported yet)
- Temporary UI state (expanded panels, etc.)
- Agent card data (refetched on connection)

### Storage Limits

- Maximum 50 sessions stored
- Automatic cleanup of oldest sessions on quota exceeded
- 1-second debounced saves to reduce I/O

## Future Enhancements

1. **Session Reconnection**: Restore A2A connection using saved contextId
2. **Session Search**: Filter/search sessions by content
3. **Session Export**: Download conversation history
4. **Session Sharing**: Share session URL with others
5. **Session Templates**: Create sessions from templates
6. **Drag-and-Drop**: Reorder sessions in sidebar
7. **Session Folders**: Organize sessions into groups
8. **Real-time Sync**: Sync sessions across devices

## Migration Notes

### Breaking Changes

- Old `useA2AClient` direct usage replaced with session-aware hooks
- Message state now managed by `useSessionManager`
- Connection state split between global (A2A connected) and per-session (contextId)

### Backward Compatibility

- Old saved conversations automatically migrated on first load
- Existing debug logs preserved
- MCP connection unchanged

## Testing Checklist

- [x] Create new conversation session
- [x] Send messages in session
- [x] Switch between sessions without losing state
- [x] Close session (not last one)
- [x] Close last session (creates new one)
- [x] Reload page → sessions restored
- [x] Tool invocation creates new session
- [x] Tool session shows in "Action Required"
- [x] Status indicators update correctly
- [x] ContextId preserved per session
- [x] Multiple concurrent streams work
- [x] LocalStorage saves/loads correctly

## Debugging

Enable verbose logging:

```typescript
localStorage.setItem('DEBUG_SESSIONS', 'true');
```

Check session state in console:

```javascript
// In browser console
JSON.parse(localStorage.getItem('ember-sessions'));
```

Debug logs show:

- Session creation/switch/close events
- ContextId received/stored events
- Tool execution session creation
- Message additions/updates
- Status changes
