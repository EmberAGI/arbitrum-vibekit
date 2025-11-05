# Bidirectional Communication - Updated Server Flow

## ✅ Implementation Updated for Correct A2A Behavior

The implementation has been updated to match the actual A2A server protocol.

## Key Changes

### 1. Use `message/stream` Instead of `message/send`

User responses now use **`message/stream`** to continue the streaming task:

```typescript
const request = {
  jsonrpc: "2.0",
  id: messageId,
  method: "message/stream", // Streaming continuation
  params: {
    message: {
      role: "user",
      parts: [{ kind: "data", data: userData }],
      contextId, // Same context continues the task
      messageId,
      metadata: {
        userInteraction: "true",
        interactionType: "component-response",
      },
    },
    configuration: {
      acceptedOutputModes: ["text/plain"],
    },
  },
};
```

### 2. Detect `input-required` and `auth-required` States

The system now detects paused tasks via status updates:

```typescript
if (event.kind === "status-update") {
  if (
    event.status?.state === "input-required" ||
    event.status?.state === "auth-required"
  ) {
    // Task is paused - awaiting user input
    onStatusUpdate(sessionId, "waiting", {
      awaitingInput: true,
      awaitingInputType: event.status.state,
      inputSchema: event.inputSchema,
      statusMessage: event.status.message,
    });
  }
}
```

## Actual Server Flow

### Step-by-Step Interaction

```
1. Agent executes task
         ↓
2. Agent sends artifact with data user needs
   Event: artifact-update
   Artifact: "delegations-to-sign"
   Parts: [{ kind: "data", data: { delegation: ... } }]
         ↓
3. Agent pauses task
   Event: status-update
   status.state: "input-required" or "auth-required"
   inputSchema: z.object({ ... }) // Defines expected response
         ↓
4. Client detects paused state
   - Sets session status to "waiting"
   - Marks awaitingInput: true
   - Shows UI for user interaction
         ↓
5. User interacts with component
   - Signs delegation
   - Clicks approve button
   - Submits form data
         ↓
6. Component calls onUserAction(data)
         ↓
7. Client sends via message/stream
   - Same contextId (continues task)
   - data: { delegations: [...signed...] }
   - metadata: { userInteraction: "true" }
         ↓
8. Agent receives user response
   - Validates against inputSchema
   - Continues task execution
         ↓
9. Agent completes or sends more events
   Event: status-update (state: "completed")
```

### Example: Pendle Delegation Signing

**Server sends artifact:**

```json
{
  "kind": "artifact-update",
  "artifact": {
    "artifactId": "delegations-to-sign",
    "name": "delegations-to-sign.json",
    "description": "Delegations that need to be signed",
    "parts": [
      {
        "kind": "data",
        "data": {
          "id": "approveUsdai",
          "description": "Allow agent to approve user's USDai",
          "delegation": {
            /* delegation data */
          }
        }
      },
      {
        "kind": "data",
        "data": {
          "id": "supplyPendle",
          "description": "Allow agent to supply user's USDai to Pendle",
          "delegation": {
            /* delegation data */
          }
        }
      }
    ]
  }
}
```

**Server pauses task:**

```json
{
  "kind": "status-update",
  "status": {
    "state": "input-required",
    "message": {
      "kind": "message",
      "messageId": "pause-confirmation",
      "contextId": "existing-context-id",
      "role": "agent",
      "parts": [
        {
          "kind": "text",
          "text": "Please sign all delegations and submit them"
        }
      ]
    }
  },
  "inputSchema": {
    "type": "object",
    "properties": {
      "delegations": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "id": { "type": "string" },
            "signedDelegation": { "type": "string" }
          }
        }
      }
    }
  }
}
```

**Client detects and waits:**

```typescript
// Session status updated to "waiting"
// awaitingInput: true
// awaitingInputType: "input-required"
```

**User signs and submits:**

```typescript
await onUserAction({
  delegations: [
    { id: "approveUsdai", signedDelegation: "0x..." },
    { id: "supplyPendle", signedDelegation: "0x..." },
  ],
});
```

**Client sends via message/stream:**

```json
{
  "jsonrpc": "2.0",
  "id": "user-action-xxx",
  "method": "message/stream",
  "params": {
    "message": {
      "role": "user",
      "parts": [
        {
          "kind": "data",
          "data": {
            "delegations": [
              { "id": "approveUsdai", "signedDelegation": "0x..." },
              { "id": "supplyPendle", "signedDelegation": "0x..." }
            ]
          }
        }
      ],
      "contextId": "existing-context-id",
      "messageId": "user-action-xxx",
      "metadata": {
        "userInteraction": "true",
        "interactionType": "component-response"
      }
    },
    "configuration": {
      "acceptedOutputModes": ["text/plain"]
    }
  }
}
```

**Server validates and continues:**

```typescript
// Server receives user response
// Validates against inputSchema
// yield result = { delegations: [...] }
// Continues task execution
```

## Implementation Details

### Status Detection (useA2ASession.ts)

```typescript
if (event.kind === "status-update") {
  if (event.status?.state) {
    const state = event.status.state;

    if (state === "input-required" || state === "auth-required") {
      console.log("[A2ASession] Task paused - awaiting user input:", state);
      onStatusUpdate(sessionId, "waiting", {
        awaitingInput: true,
        awaitingInputType: state,
        inputSchema: event.inputSchema,
        statusMessage: event.status.message,
      });
    } else {
      // Normal status mapping
      const statusMap = {
        pending: "waiting",
        working: "working",
        completed: "completed",
        // ...
      };
      onStatusUpdate(sessionId, statusMap[state] || "active", event.status);
    }
  }
}
```

### User Response Sending (page.tsx)

```typescript
await sendToActiveTask(
  activeSessionId,
  agentEndpoint,
  contextId,
  userData,
  // onMessage callback for streaming responses
  (sessionId, messageId, content, sender, updates) => {
    if (messageId) {
      updateMessageInSession(sessionId, messageId, {
        content,
        sender,
        ...updates,
      });
      return messageId;
    } else {
      return addMessageToSession(sessionId, { sender, content, ...updates });
    }
  },
  // onStatusUpdate callback for status changes
  (sessionId, status, statusData) => {
    updateSessionStatus(sessionId, status);
    if (statusData?.awaitingInput) {
      addDebugLog("info", "Task paused - awaiting user input", {
        sessionId,
        inputType: statusData.awaitingInputType,
      });
    }
  }
);
```

## Component Integration

Components receive the artifact data BEFORE the pause:

```typescript
interface DelegationSignerProps {
  delegations: Array<{
    id: string;
    description: string;
    delegation: any;
  }>;
  onUserAction?: (data: any) => Promise<void>;
}

export function DelegationSigner({
  delegations,
  onUserAction,
}: DelegationSignerProps) {
  const handleSign = async () => {
    // Sign each delegation
    const signed = await Promise.all(
      delegations.map(async (d) => ({
        id: d.id,
        signedDelegation: await signDelegation(d.delegation),
      }))
    );

    // Send back to agent
    await onUserAction({ delegations: signed });
  };

  return (
    <div>
      {delegations.map((d) => (
        <div key={d.id}>
          <h3>{d.description}</h3>
          {/* Show delegation details */}
        </div>
      ))}
      <button onClick={handleSign}>Sign All</button>
    </div>
  );
}
```

## Key Differences from Previous Implementation

| Aspect            | Old (Incorrect)              | New (Correct)                                     |
| ----------------- | ---------------------------- | ------------------------------------------------- |
| Method            | `message/send`               | `message/stream`                                  |
| Response Type     | JSON                         | Server-Sent Events (SSE)                          |
| Pause Detection   | Custom flag                  | `status.state` = `input-required`/`auth-required` |
| Task Continuation | New task                     | Same task via contextId                           |
| Data Flow         | Artifact includes pause flag | Artifact → then separate status-update            |

## Testing

### Test with Mock Server Response

1. **Artifact arrives:**

   - Component renders with data
   - User sees UI to interact

2. **Status update arrives:**

   - Session status → "waiting"
   - awaitingInput → true
   - Component remains visible

3. **User interacts:**

   - Component calls `onUserAction(data)`
   - Client sends via `message/stream`

4. **Stream continues:**
   - New messages arrive
   - Task completes or continues

### Debug Logs to Check

```
[A2ASession] Event: artifact-update for session: conv-xxx
[A2ASession] Event: status-update for session: conv-xxx
[A2ASession] Task paused - awaiting user input: input-required
[Main] User action from component: { delegations: [...] }
[A2ASession] Sending user interaction data to active task
[A2ASession] User interaction sent, processing stream...
```

## Summary

✅ **Corrected:** Now uses `message/stream` for bidirectional communication  
✅ **Corrected:** Detects `input-required` and `auth-required` status updates  
✅ **Corrected:** Continues same task with same contextId  
✅ **Corrected:** Processes streaming responses after user input  
✅ **Ready:** Full bidirectional flow implemented correctly

The system now matches the actual A2A protocol for paused tasks and user interactions!
