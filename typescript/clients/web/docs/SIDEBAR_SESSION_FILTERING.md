# Sidebar Session Filtering & State Indicators

## Overview

The sidebar now intelligently filters and groups sessions based on their state, providing clear visual indicators for sessions requiring user action.

## Features Implemented

### 1. Session Grouping

Sessions are now separated into two distinct sections:

#### **Action Required**

- Sessions with `status: 'waiting'` AND `awaitingInput: true`
- Shows sessions paused by the agent awaiting user input (signatures, approvals, etc.)
- Includes sessions in `input-required` or `auth-required` states
- **Visual Indicator:** Red dot on the right side of each session

#### **Live**

- Sessions that are actively working or connecting
- Includes `working`, `active`, and `connecting` statuses
- Excludes sessions already in "Action Required"
- **Visual Indicator:** Animated spinner icon for active processing

### 2. Dynamic Icons Based on State

Each session displays an icon representing its current state:

| State                  | Icon                  | Description                          |
| ---------------------- | --------------------- | ------------------------------------ |
| **Awaiting Input**     | `<AlertCircle>`       | Session paused, user action required |
| **Working/Connecting** | `<Loader>` (animated) | Session actively processing          |
| **Completed**          | `<CheckCircle>`       | Session completed successfully       |
| **Default**            | `<Circle>`            | Idle or other states                 |

### 3. Visual Design

#### Action Required Sessions

```tsx
<div className="relative">
  {/* Red indicator dot */}
  <div className="absolute right-2 top-1/2 -translate-y-1/2">
    <div className="w-2 h-2 rounded-full bg-red-500" />
  </div>

  <div className="flex items-center gap-2 pr-6">
    <AlertCircle className="w-4 h-4" />
    <div>
      <div className="font-medium">Session Title</div>
      <div className="text-xs text-muted-foreground">Awaiting user input</div>
    </div>
  </div>
</div>
```

#### Live Sessions

```tsx
<div className="flex items-center gap-2">
  <Loader className="w-4 h-4 animate-spin" />
  <div>
    <div className="font-medium">Session Title</div>
    <div className="text-xs text-muted-foreground">Active</div>
  </div>
</div>
```

### 4. Collapsible Sections

Both "Action Required" and "Live" sections are collapsible:

- Default: Both sections expanded
- Click header to collapse/expand
- Chevron icons indicate state
- State persists during session

## Implementation Details

### Session Filtering Logic

```typescript
// Filter sessions requiring action
const actionRequiredSessions = sessionOrder.filter((sessionId) => {
  const session = sessions[sessionId];
  return (
    session?.status === 'waiting' &&
    session.messages?.some((msg: any) => msg.awaitingUserAction || msg.statusData?.awaitingInput)
  );
});

// Filter live/active sessions
const liveSessions = sessionOrder.filter((sessionId) => {
  const session = sessions[sessionId];
  if (!session) return false;
  return (
    (session.status === 'working' ||
      session.status === 'active' ||
      session.status === 'connecting') &&
    !actionRequiredSessions.includes(sessionId)
  );
});
```

### Icon Selection Logic

```typescript
const getSessionIcon = (session: Session) => {
  // Check if session is awaiting user input
  const hasAwaitingInput = session.messages?.some(
    (msg: any) => msg.awaitingUserAction || msg.statusData?.awaitingInput
  );

  if (hasAwaitingInput || session.status === "waiting") {
    return <AlertCircle className="w-4 h-4" />;
  }
  if (session.status === "working" || session.status === "connecting") {
    return <Loader className="w-4 h-4 animate-spin" />;
  }
  if (session.status === "completed") {
    return <CheckCircle className="w-4 h-4" />;
  }
  return <Circle className="w-4 h-4" />;
};
```

## Data Flow

### When Status Update Arrives

```typescript
// In page.tsx - onStatusUpdate callback
onStatusUpdate: (sessionId, status, data) => {
  updateSessionStatus(sessionId, status);

  // Store awaiting input data in the last message
  if (data?.awaitingInput) {
    const session = sessions[sessionId];
    if (session && session.messages.length > 0) {
      const lastMessageId = session.messages[session.messages.length - 1].id;
      updateMessageInSession(sessionId, lastMessageId, {
        awaitingUserAction: true,
        statusData: data,
      });
    }
    addDebugLog('info', 'Task paused - awaiting user input', {
      sessionId,
      inputType: data.awaitingInputType,
    });
  }
};
```

### Server Status Update

When the agent pauses a task:

```json
{
  "kind": "status-update",
  "status": {
    "state": "input-required" // or "auth-required"
  },
  "inputSchema": { ... }
}
```

The client:

1. Detects `input-required`/`auth-required` state
2. Sets session `status` to `"waiting"`
3. Stores `statusData` with `awaitingInput: true`
4. Marks last message with `awaitingUserAction: true`
5. Sidebar detects this and moves session to "Action Required"
6. Red dot appears on session

## Type Updates

### SessionMessage Interface

```typescript
export interface SessionMessage {
  // ... existing fields

  // Status data for input-required/auth-required states
  statusData?: {
    awaitingInput?: boolean;
    awaitingInputType?: string; // "input-required" | "auth-required"
    inputSchema?: any;
    statusMessage?: any;
  };
  awaitingUserAction?: boolean; // Quick flag for checking
}
```

### Session Interface

```typescript
export interface Session {
  // ... existing fields

  subtitle?: string; // Optional subtitle for display in sidebar
}
```

## Files Modified

1. **`src/components/AppSidebar.tsx`**
   - Added session filtering logic
   - Added "Agent Activity" header
   - Separated "Action Required" and "Live" sections
   - Implemented dynamic icon selection
   - Added red dot indicator for action required sessions
   - Added subtitle display support

2. **`src/lib/types/session.ts`**
   - Added `statusData` field to `SessionMessage`
   - Added `awaitingUserAction` flag to `SessionMessage`
   - Added `subtitle` field to `Session`

3. **`src/app/page.tsx`**
   - Updated all `onStatusUpdate` callbacks to store `awaitingInput` data
   - Added logging for paused tasks

## User Experience

### Before

- All sessions listed in a single flat list
- No clear indication which sessions need attention
- Status only shown as small icon
- Difficult to prioritize tasks

### After

- Sessions grouped by priority
- Clear "Action Required" section at top
- Red dots immediately draw attention
- Animated spinners show active processing
- Subtitle provides context
- Easy to see what needs immediate attention

## Testing

### Test Scenario 1: Task Requiring Signature

1. **Agent sends delegation signing artifact**

   ```
   Status: working → waiting
   awaitingInput: true
   awaitingInputType: "auth-required"
   ```

2. **Expected Sidebar Behavior:**
   - Session moves to "Action Required" section
   - Shows `<AlertCircle>` icon
   - Red dot appears on right side
   - Subtitle: "Awaiting user input"

3. **After User Signs:**

   ```
   Status: waiting → working
   awaitingInput: false
   ```

4. **Expected Sidebar Behavior:**
   - Session moves to "Live" section
   - Shows animated `<Loader>` icon
   - Red dot disappears
   - Subtitle: "Active"

### Test Scenario 2: Multiple Sessions

1. **Setup:**
   - Session A: Working on swap
   - Session B: Waiting for signature
   - Session C: Waiting for approval
   - Session D: Completed

2. **Expected Sidebar Display:**

   ```
   Agent Activity

   ▼ Action required
     ⚠️ Session B: USDai Delegation    🔴
        Awaiting user input
     ⚠️ Session C: Approve Transaction 🔴
        Awaiting user input

   ▼ Live
     ⟳ Session A: Create Swap
        Active
   ```

## Summary

✅ **Intelligent Grouping:** Sessions separated by priority  
✅ **Visual Indicators:** Red dots for action required  
✅ **Dynamic Icons:** Icons match session state  
✅ **Clear Labels:** "Action Required" and "Live" sections  
✅ **Subtitles:** Additional context for each session  
✅ **Collapsible:** Can hide/show sections  
✅ **Real-time Updates:** Moves between sections automatically

The sidebar now provides an at-a-glance view of task priorities, making it immediately clear which sessions need attention!
