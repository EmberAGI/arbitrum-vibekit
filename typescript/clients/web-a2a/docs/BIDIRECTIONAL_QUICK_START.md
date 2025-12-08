# Bidirectional Communication - Quick Start

## ✅ Implementation Complete & Updated

The bidirectional communication mechanism is **fully implemented** with the correct A2A protocol!

### ⚡ Recent Update

- Now uses `message/stream` (not `message/send`)
- Detects `input-required` and `auth-required` status updates
- Continues same task with same contextId

## What Was Built

### 1. Core Communication Layer

- **`sendToActiveTask()`** function in `useA2ASession` hook
- Sends user interaction data back to active A2A tasks
- Uses existing `contextId` to continue in same conversation

### 2. Component Integration

- **`onUserAction`** prop automatically passed to all custom components
- No configuration needed - just use the callback in your components

### 3. Example Component

- **`InteractiveExample`** component demonstrates all patterns:
  - Approval/rejection buttons
  - Text input fields
  - Loading states
  - Error handling
  - Success feedback

## Quick Usage in Your Component

```typescript
interface YourComponentProps {
  // Your data
  someData: any;

  // This is automatically injected
  onUserAction?: (data: any) => Promise<void>;
}

export function YourComponent({ someData, onUserAction }: YourComponentProps) {
  const handleClick = async () => {
    if (!onUserAction) return;

    await onUserAction({
      componentType: "your-component",
      action: "user-clicked",
      data: someData,
      timestamp: new Date().toISOString(),
    });
  };

  return <button onClick={handleClick}>Send to Agent</button>;
}
```

## Testing

### Test with InteractiveExample Component

The agent should return an artifact like:

```json
{
  "kind": "artifact-update",
  "artifact": {
    "artifactId": "test-1",
    "name": "tool-call-interactive-example",
    "parts": [
      {
        "kind": "data",
        "data": {
          "title": "Test Interaction",
          "description": "Click approve to test",
          "requiresSignature": true,
          "awaitingInput": true
        }
      }
    ]
  }
}
```

Then:

1. Component renders with "Approve & Sign" button
2. User clicks button
3. Data sent to agent via `message/send` method
4. Agent receives user response and continues
5. Component shows success message

## What to Send Back

```typescript
{
  componentType: string;      // Identify your component (required)
  action: string;             // What happened (required)
  timestamp: string;          // ISO timestamp (recommended)
  ...yourCustomData           // Any additional data
}
```

## Server-Side Flow

### 1. Agent Sends Artifact with Data

```json
{
  "kind": "artifact-update",
  "artifact": {
    "artifactId": "delegations-to-sign",
    "name": "delegations-to-sign.json",
    "parts": [{ "kind": "data", "data": { delegation: {...} } }]
  }
}
```

### 2. Agent Pauses Task

```json
{
  "kind": "status-update",
  "status": {
    "state": "input-required",  // or "auth-required"
    "message": { ... }
  },
  "inputSchema": {
    "type": "object",
    "properties": { ... }
  }
}
```

### 3. Client Detects Pause

- Session status → `"waiting"`
- `awaitingInput` → `true`
- Component stays visible for user interaction

### 4. User Responds

Component calls `onUserAction(data)` → Client sends via `message/stream`

### 5. Agent Receives Response

```typescript
// In your agent's generator:
const userSignedDelegations = yield {
  type: 'pause',
  status: { state: 'input-required' },
  inputSchema: z.object({ ... })
};
// userSignedDelegations = { delegations: [...] }
```

## Files to Check

- **Implementation:** `src/lib/hooks/useA2ASession.ts` (line 900)
- **Integration:** `src/components/ToolResultRenderer.tsx` (line 32)
- **Usage:** `src/app/page.tsx` (line 487)
- **Example:** `src/components/tools/InteractiveExample.tsx`
- **Full Docs:** `BIDIRECTIONAL_COMMUNICATION.md`
- **Updated Flow:** `BIDIRECTIONAL_UPDATED_FLOW.md`

## Status Detection

Tasks pause with status updates:

- `status.state === "input-required"` → User needs to provide data
- `status.state === "auth-required"` → User needs to sign/authorize
- `inputSchema` → Defines what data is expected back

## Current Status

✅ **Mechanism:** Ready (uses `message/stream`)  
✅ **Component Support:** Ready  
✅ **Example Component:** Ready  
✅ **Status Detection:** Ready (`input-required`, `auth-required`)  
✅ **Streaming Response:** Ready (processes SSE after user input)

**The infrastructure is complete and matches the A2A protocol!** Ready for production use.
