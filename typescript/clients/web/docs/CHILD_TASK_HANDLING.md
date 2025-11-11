# Child Task Handling

## Overview

This document describes the implementation of child task (workflow) handling in the application. When an agent response includes a child task reference, the system automatically creates a new tab/session and resubscribes to that task to display custom component artifacts.

## Problem Statement

Some A2A agent responses trigger child tasks (workflows) that:

- Execute in a separate task context
- Return custom component artifacts (interactive UI)
- Need to be displayed in their own tab
- Share the same contextId as the parent task

The application needs to detect these child tasks and automatically create appropriate sessions to display them.

## Detection Method

Child tasks are detected in `status-update` events through the `referenceTaskIds` field:

```typescript
if (
  event.kind === "status-update" &&
  event.status.message?.referenceTaskIds?.length
) {
  const childTaskId = event.status.message.referenceTaskIds[0];
  console.log(`[Parent] childTaskId (workflow): ${childTaskId}`);
}
```

## Implementation

### 1. A2A Session Hook Updates (`useA2ASession.ts`)

#### Added Callback Interface

```typescript
interface A2ASessionConfig {
  // ... existing fields
  onChildTaskDetected?: (
    parentSessionId: string,
    childTaskId: string,
    contextId: string,
    metadata?: any
  ) => void;
}
```

#### Detection Logic in Status-Update Events

Both `sendMessage` and `reconnectToStream` now detect child tasks:

```typescript
if (event.kind === "status-update") {
  // Detect child task (workflow) from referenceTaskIds
  if (
    event.status?.message?.referenceTaskIds &&
    event.status.message.referenceTaskIds.length > 0
  ) {
    const childTaskId = event.status.message.referenceTaskIds[0];
    console.log(
      `[A2ASession] Child task detected in session ${sessionId}: ${childTaskId}`
    );

    // Notify about child task detection
    if (onChildTaskDetected && contextId) {
      onChildTaskDetected(sessionId, childTaskId, contextId, {
        workflowName:
          event.status.message.metadata?.referencedWorkflow?.workflowName,
        description:
          event.status.message.metadata?.referencedWorkflow?.description,
        message: event.status.message,
      });
    }
  }
  // ... rest of status-update handling
}
```

### 2. Main Page Handler (`page.tsx`)

#### Child Task Handler Function

Created `handleChildTask` function that:

1. Creates a new session with the workflow name as title
2. Copies connection details (contextId, agentEndpoint) from parent
3. Adds the child task to the new session's task list
4. Immediately resubscribes to the child task using `tasks/resubscribe`
5. Switches to the new session to display the results

```typescript
const handleChildTask = useCallback(
  (
    parentSessionId: string,
    childTaskId: string,
    contextId: string,
    metadata?: any
  ) => {
    const workflowName = metadata?.workflowName || "Workflow";

    // Create a new session for the child task
    const childSessionId = createSession({
      type: "conversation",
      title: workflowName,
    });

    // Copy connection details from parent
    const parentSession = sessions[parentSessionId];
    setSessionContextId(childSessionId, contextId);
    setSessionAgentEndpoint(childSessionId, parentSession.agentEndpoint);

    // Add the child task
    addTask(childSessionId, childTaskId, "working");

    // Immediately resubscribe to get artifacts
    reconnectToStream({
      sessionId: childSessionId,
      agentEndpoint: parentSession.agentEndpoint,
      contextId: contextId,
      taskId: childTaskId,
      // ... all callbacks including nested onChildTaskDetected
    });

    // Switch to the new child task session
    switchSession(childSessionId);
  },
  [
    /* dependencies */
  ]
);
```

#### Integration into Callbacks

Added `onChildTaskDetected: handleChildTask` to:

- Auto-reconnection on app load
- Message sending
- Session switching reconnection

## Flow Diagram

```
Parent Task
    ↓
  Agent detects workflow needed
    ↓
  status-update with referenceTaskIds
    ↓
  onChildTaskDetected callback fired
    ↓
  handleChildTask() executes
    ↓
  1. Create new session (workflowName as title)
  2. Copy contextId & agentEndpoint from parent
  3. Add child taskId to new session
  4. Call reconnectToStream with child taskId
    ↓
  A2A tasks/resubscribe to child task
    ↓
  Receive artifacts (custom components)
    ↓
  Display in new tab
```

## Example Scenario

### Parent Task Triggers Workflow

1. **User sends message**: "Execute the lending strategy"
2. **Agent creates parent task**: `task-parent-123`
3. **Agent responds**: Analyzing lending options...
4. **Agent triggers workflow**: Creates child task `task-child-456`
5. **status-update event received**:

   ```json
   {
     "kind": "status-update",
     "status": {
       "message": {
         "referenceTaskIds": ["task-child-456"],
         "metadata": {
           "referencedWorkflow": {
             "workflowName": "Lending Strategy",
             "description": "Interactive lending configuration"
           }
         }
       }
     }
   }
   ```

6. **Child task detected**: `onChildTaskDetected` callback fires
7. **New session created**: "Lending Strategy" tab appears
8. **Resubscription initiated**: `tasks/resubscribe` for `task-child-456`
9. **Artifacts received**: Custom `Lending` component with interactive UI
10. **User sees**: New tab with lending configuration interface

## Key Features

### 1. **Automatic Tab Creation**

- New session automatically created when child task detected
- Tab labeled with workflow name
- Maintains parent's connection details

### 2. **Immediate Resubscription**

- Uses `tasks/resubscribe` method
- Connects to child task immediately after creation
- Receives all pending artifacts

### 3. **Shared Context**

- Child session uses same `contextId` as parent
- Maintains conversation context
- Agent can track related tasks

### 4. **Nested Child Tasks**

- Supports recursive child task detection
- Child tasks can themselves trigger more child tasks
- Each gets its own tab

### 5. **Custom Component Support**

- Child tasks typically return custom component artifacts
- Artifacts rendered in the new tab
- Full interactivity preserved

## Message Flow

### Parent Session

```
User: "Execute lending strategy"
  ↓
Agent: "Analyzing your portfolio..." (parent task working)
  ↓
Agent: Creates child task for interactive workflow
  ↓
Parent task status-update: referenceTaskIds = [child-task-id]
  ↓
[Child task detected - new tab created]
  ↓
Agent: "Workflow initiated" (parent task continues)
```

### Child Session (New Tab)

```
[Automatically created]
  ↓
Resubscribing to child task...
  ↓
Receiving artifacts...
  ↓
[Custom Lending Component Rendered]
  ↓
User interacts with component
  ↓
Component sends data back to agent
  ↓
More artifacts/responses received
```

## Configuration

No configuration needed! Child task detection is automatic for all A2A sessions.

The system will:

- ✅ Detect child tasks in any status-update event
- ✅ Create appropriate sessions automatically
- ✅ Resubscribe to child tasks immediately
- ✅ Display artifacts in new tabs
- ✅ Handle nested child tasks recursively

## Debug Logs

Look for these log messages to track child task handling:

```
[A2ASession] Child task detected in session conv-123: task-child-456
[Main] Creating child task session: { parentSessionId, childTaskId, contextId, workflowName }
[SessionManager] Adding task to session conv-789 : task-child-456 state: working
[Main] Resubscribing to child task: task-child-456
[A2ASession] Resubscribing to task for session: conv-789
[A2ASession] Resubscribe Event: artifact-update for session: conv-789
```

## Benefits

### 1. **Seamless Workflow Integration**

- Workflows appear automatically
- No manual intervention needed
- Clear visual separation in tabs

### 2. **Context Preservation**

- All child tasks share parent's context
- Agent maintains full conversation history
- Related tasks are linked

### 3. **Interactive UI**

- Child tasks often return custom components
- Full interactivity in dedicated tabs
- Better UX than inline components

### 4. **Scalability**

- Supports unlimited child tasks
- Nested workflows handled recursively
- Each task properly isolated

### 5. **Task History**

- All child tasks tracked in task history
- Parent-child relationships maintained
- Full audit trail

## Testing

### Test Case 1: Simple Child Task

1. Send message that triggers a workflow
2. Verify new tab appears with workflow name
3. Verify custom component renders in new tab
4. Verify parent tab still shows parent task

### Test Case 2: Nested Child Tasks

1. Trigger a workflow that spawns sub-workflows
2. Verify multiple new tabs created
3. Verify each tab has correct task ID
4. Verify all share same contextId

### Test Case 3: Child Task with User Interaction

1. Trigger workflow with interactive component
2. Interact with component in child tab
3. Verify interactions sent to agent
4. Verify responses appear in correct tab

### Test Case 4: Multiple Sequential Child Tasks

1. Execute multiple workflows in sequence
2. Verify each gets its own tab
3. Verify all tabs maintained in session list
4. Verify can switch between tabs freely

## Error Handling

### No Parent Session Found

```typescript
if (!parentSession) {
  console.error("[Main] Parent session not found:", parentSessionId);
  return; // Abort child task creation
}
```

### No Agent Endpoint

```typescript
if (!parentSession.agentEndpoint) {
  console.warn("[Main] No agent endpoint for child task");
  // Child session created but not connected
}
```

### Resubscription Failure

If resubscription fails, the child session will show an error state. The task history will still show the child task for debugging.

## Future Enhancements

1. **Parent-Child Linking**: Visual indicator showing which tabs are related
2. **Cascade Closing**: Option to close child tasks when parent closes
3. **Tab Grouping**: Group related tasks visually
4. **Workflow Progress**: Show parent task progress while child executes
5. **Return to Parent**: Quick navigation button to jump back to parent

## Related Documentation

- [Multi-Task Per Session](./MULTI_TASK_PER_SESSION.md)
- [A2A Resubscribe Implementation](./RESUBSCRIBE_IMPLEMENTATION.md)
- [Custom Tool Components](../CUSTOM_TOOL_COMPONENTS.md)
