# Multiple Tasks Per Session

## Overview

This document describes the implementation of multiple task tracking per session/tab. Previously, each session tracked only a single `taskId`. Now each session maintains a complete task history, allowing for multiple tasks over time while only resubscribing to the latest incomplete task.

## Problem Statement

In the original implementation:

- Each session/tab tracked only one `taskId`
- When a task completed, the next message would overwrite the previous task ID
- Completed tasks weren't tracked in history
- No ability to see which tasks belonged to a session
- Couldn't distinguish between completed and active tasks for resubscription

## Solution

### Task History System

Each session now maintains an array of `TaskInfo` objects tracking all tasks created during the session's lifetime:

```typescript
export interface TaskInfo {
  taskId: string;
  state: TaskState;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  error?: string;
}

export type TaskState = 'pending' | 'working' | 'completed' | 'failed' | 'cancelled';
```

### Session Structure

```typescript
export interface Session {
  // ... other fields
  contextId: string | null;
  agentEndpoint: string | null;
  tasks: TaskInfo[]; // Task history (oldest to newest)
  // ... other fields
}
```

## Key Features

### 1. **Complete Task History**

- All tasks are stored in the `tasks` array, ordered from oldest to newest
- Completed tasks remain in history
- Each task has its own lifecycle with state transitions

### 2. **Smart Resubscription**

- When reconnecting, only the latest incomplete task is used
- Helper function `getLatestIncompleteTask()` finds the right task
- If all tasks are complete, a new message creates a new task

### 3. **Task State Tracking**

- Tasks transition through states: `pending` → `working` → `completed`/`failed`
- State changes are tracked with timestamps
- Error information is preserved for failed tasks

### 4. **Automatic Task Management**

- New tasks are automatically added when received from the agent
- Task states are updated based on A2A status-update events
- localStorage automatically persists the entire task history

## Implementation Details

### Helper Functions (session.ts)

```typescript
// Get the latest incomplete task
function getLatestIncompleteTask(tasks: TaskInfo[]): TaskInfo | null {
  for (let i = tasks.length - 1; i >= 0; i--) {
    if (tasks[i].state === 'pending' || tasks[i].state === 'working') {
      return tasks[i];
    }
  }
  return null;
}

// Get the latest task regardless of state
function getLatestTask(tasks: TaskInfo[]): TaskInfo | null {
  return tasks.length > 0 ? tasks[tasks.length - 1] : null;
}

// Find a specific task by ID
function findTaskById(tasks: TaskInfo[], taskId: string): TaskInfo | null {
  return tasks.find((task) => task.taskId === taskId) || null;
}

// Create a new task info object
function createTaskInfo(taskId: string, state: TaskState = 'pending'): TaskInfo {
  return {
    taskId,
    state,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
```

### Session Manager Methods

```typescript
// Add a new task to a session
addTask(sessionId: string, taskId: string, state?: TaskState): void

// Update an existing task's state
updateTaskState(sessionId: string, taskId: string, state: TaskState, error?: string): void

// Get the latest incomplete task ID for resubscription
getLatestIncompleteTaskId(sessionId: string): string | null
```

### A2A Session Callbacks

```typescript
interface A2ASessionConfig {
  // ... other fields

  // Called when a new task is created
  onTaskReceived?: (sessionId: string, taskId: string, state: string) => void;

  // Called when a task's state changes
  onTaskStateChanged?: (sessionId: string, taskId: string, state: string) => void;
}
```

## Task Lifecycle

### 1. New Message → New Task

```
User sends message
    ↓
A2A creates task
    ↓
"task" event received → onTaskReceived(sessionId, taskId, "pending")
    ↓
addTask() called → New TaskInfo added to session.tasks[]
    ↓
Task tracked in history with "pending" state
```

### 2. Task Processing

```
"status-update" event received → onTaskStateChanged(sessionId, taskId, "working")
    ↓
updateTaskState() called → Task state updated to "working"
    ↓
More status updates...
    ↓
Final status-update → onTaskStateChanged(sessionId, taskId, "completed")
    ↓
updateTaskState() called → Task state updated to "completed", completedAt set
```

### 3. Reconnection to Incomplete Task

```
User switches to tab with incomplete task
    ↓
getLatestIncompleteTaskId() called → Returns latest task with state "pending" or "working"
    ↓
reconnectToStream() called with taskId
    ↓
A2A tasks/resubscribe method used → Resume receiving updates for that task
```

### 4. Next Message After Completion

```
Previous task completed (state = "completed")
    ↓
User sends new message
    ↓
New task created
    ↓
Both tasks now in session.tasks[] array
    ↓
getLatestIncompleteTaskId() returns new task ID for any reconnection needs
```

## State Mapping

### A2A States → TaskState

| A2A State          | TaskState | Description                   |
| ------------------ | --------- | ----------------------------- |
| pending            | pending   | Task created, not yet started |
| working, running   | working   | Task is actively processing   |
| completed, success | completed | Task finished successfully    |
| failed, error      | failed    | Task failed with error        |
| cancelled          | cancelled | Task was cancelled            |

## Example Scenario

### Conversation Flow

1. **User sends "Hello"**
   - Task `task-001` created (state: pending)
   - Task transitions to working
   - Task completes (state: completed)
   - `session.tasks = [{ taskId: "task-001", state: "completed", ... }]`

2. **User sends "What's the weather?"**
   - Task `task-002` created (state: pending)
   - Task transitions to working
   - Task completes (state: completed)
   - `session.tasks = [task-001, task-002]` (both completed)

3. **User sends "Tell me more"**
   - Task `task-003` created (state: pending)
   - Task transitions to working
   - **User switches tabs before completion**

4. **User switches back to this tab**
   - `getLatestIncompleteTaskId()` returns `"task-003"`
   - `reconnectToStream()` called with `taskId: "task-003"`
   - A2A `tasks/resubscribe` method used
   - Stream resumes, task completes
   - `session.tasks = [task-001, task-002, task-003]`

All three tasks are preserved in history!

## Benefits

### 1. **Complete History**

- See all tasks that have been executed in a session
- Track when each task was created and completed
- Preserve error information for failed tasks

### 2. **Accurate Resubscription**

- Only resubscribe to tasks that are actually incomplete
- Don't try to resubscribe to completed tasks
- New messages after completion create new tasks

### 3. **Better State Management**

- Clear distinction between active and historical tasks
- Track task lifecycle from creation to completion
- Proper cleanup when tasks complete

### 4. **Debugging & Analytics**

- Full audit trail of tasks per session
- Performance tracking (creation → completion time)
- Error rate tracking per session

## Usage Examples

### Get Latest Incomplete Task

```typescript
const taskId = getLatestIncompleteTaskId(sessionId);
if (taskId) {
  // Reconnect to this task
  reconnectToStream({ sessionId, taskId, ... });
}
```

### Add a New Task

```typescript
onTaskReceived: (sessionId, taskId, state) => {
  const taskState = mapA2AStateToTaskState(state);
  addTask(sessionId, taskId, taskState);
  console.log(`Task ${taskId} added with state ${taskState}`);
};
```

### Update Task State

```typescript
onTaskStateChanged: (sessionId, taskId, state) => {
  const taskState = mapA2AStateToTaskState(state);
  updateTaskState(sessionId, taskId, taskState);
  console.log(`Task ${taskId} changed to ${taskState}`);
};
```

### Check Task History

```typescript
const session = sessions[sessionId];
console.log(`Session has ${session.tasks.length} tasks`);

const completedTasks = session.tasks.filter((t) => t.state === 'completed');
console.log(`${completedTasks.length} tasks completed`);

const latestTask = session.tasks[session.tasks.length - 1];
console.log(`Latest task: ${latestTask.taskId} (${latestTask.state})`);
```

## Migration from Single TaskId

### Before

```typescript
interface Session {
  // ...
  taskId: string | null; // Only one task
}

// Getting task for reconnection
const taskId = session.taskId;
```

### After

```typescript
interface Session {
  // ...
  tasks: TaskInfo[]; // Array of all tasks
}

// Getting task for reconnection
const taskId = getLatestIncompleteTaskId(sessionId);
```

### Backward Compatibility

The new system is fully backward compatible:

- Old sessions without `tasks` array will initialize with empty array
- If no incomplete tasks exist, new messages create new tasks
- localStorage format handles both old and new sessions

## Debug Logs

Look for these log messages to track task management:

```
[SessionManager] Adding task to session conv-123 : task-001 state: pending
[A2ASession] Task created: task-001
[SessionManager] Updated task state conv-123 task-001 : working
[SessionManager] Updated task state conv-123 task-001 : completed
[A2ASession] Resubscribing to task for session: conv-123 { taskId: "task-002" }
```

## Testing

### Test Case 1: Multiple Messages in Sequence

1. Send message "Hello" → Task 1 created and completed
2. Send message "World" → Task 2 created and completed
3. Check `session.tasks.length` === 2
4. Check both tasks have state "completed"

### Test Case 2: Reconnection to Incomplete Task

1. Send message that takes long time → Task 1 created, state "working"
2. Switch to another tab
3. Switch back
4. Verify reconnection uses Task 1's ID
5. Task completes → state becomes "completed"
6. Send new message → Task 2 created
7. Check `session.tasks.length` === 2

### Test Case 3: No Incomplete Tasks

1. Complete several tasks
2. All tasks have state "completed"
3. `getLatestIncompleteTaskId()` returns null
4. New message creates new task
5. That task becomes the latest incomplete task

## Related Documentation

- [A2A Resubscribe Implementation](./RESUBSCRIBE_IMPLEMENTATION.md)
- [Session Management](./SESSION_SUMMARY.md)
- [A2A Reconnection Feature](./A2A_RECONNECTION_FEATURE.md)
