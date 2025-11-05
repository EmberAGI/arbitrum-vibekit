# Bidirectional Communication with A2A Streams

## Overview

This feature enables **two-way communication** between custom components and active A2A streaming tasks. Components can send data back to the agent mid-stream, enabling interactive workflows such as:

- Transaction signing approval
- User input collection
- Form submissions
- Confirmation dialogs
- Multi-step interactive processes

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        A2A AGENT                                 │
│                                                                  │
│  1. Sends artifact requiring user action                        │
│     { requiresSignature: true, transactionData: {...} }         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    STREAMING CHANNEL                             │
│                  (SSE Event Stream)                              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    CUSTOM COMPONENT                              │
│                  (InteractiveExample)                            │
│                                                                  │
│  2. Displays UI requiring user action                           │
│  3. User clicks "Approve & Sign"                                │
│  4. Calls onUserAction({ signature: "0x..." })                  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    handleUserAction                              │
│                   (in page.tsx)                                  │
│                                                                  │
│  5. Validates session and contextId                             │
│  6. Calls sendToActiveTask()                                    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    sendToActiveTask                              │
│                  (useA2ASession hook)                            │
│                                                                  │
│  7. Prepares message with contextId                             │
│  8. Sends POST to agent endpoint                                │
│     method: "message/send"                                      │
│     contextId: (same context)                                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                        A2A AGENT                                 │
│                                                                  │
│  9. Receives user response                                      │
│  10. Continues task execution                                   │
│  11. Sends completion status                                    │
└─────────────────────────────────────────────────────────────────┘
```

## Implementation

### 1. Core Hook: `useA2ASession`

Added `sendToActiveTask` function:

```typescript
const sendToActiveTask = async (
  sessionId: string,
  agentEndpoint: string,
  contextId: string,
  data: any,
  metadata?: Record<string, string>
) => {
  // Sends user interaction data back to active task
  // Uses same contextId to continue in same conversation
};
```

**Parameters:**

- `sessionId`: Current session ID
- `agentEndpoint`: Agent's A2A endpoint URL
- `contextId`: Active task's context ID (critical for continuation)
- `data`: User response data (component-specific)
- `metadata`: Optional additional metadata

**Request Format:**

```json
{
  "jsonrpc": "2.0",
  "id": "user-action-xxx",
  "method": "message/send",
  "params": {
    "message": {
      "role": "user",
      "parts": [
        {
          "kind": "data",
          "data": {
            /* user response */
          }
        }
      ],
      "messageId": "user-action-xxx",
      "contextId": "existing-context-id",
      "metadata": {
        "userInteraction": "true",
        "interactionType": "component-response"
      }
    }
  }
}
```

### 2. Component Integration: `ToolResultRenderer`

Updated to accept and pass `onUserAction` callback:

```typescript
export interface ToolResultRendererProps {
  toolName: string;
  result: any;
  isLoading?: boolean;
  error?: string | null;
  onUserAction?: (data: any) => Promise<void>; // NEW!
}
```

The callback is automatically passed to custom components:

```typescript
if (onUserAction && componentName !== "JsonViewer") {
  componentProps = {
    ...componentProps,
    onUserAction, // Injected into component props
  };
}
```

### 3. Page-Level Handler: `page.tsx`

Wires everything together:

```typescript
const handleUserAction = useCallback(
  async (data: any) => {
    if (!activeSessionId || !agentEndpoint) return;

    const contextId = getSessionContextId(activeSessionId);
    if (!contextId) return;

    await sendToActiveTask(activeSessionId, agentEndpoint, contextId, data);
  },
  [activeSessionId, agentEndpoint, getSessionContextId, sendToActiveTask]
);
```

Passes to all rendered components:

```tsx
<ToolResultRenderer
  key={artifact.artifactId}
  toolName={artifact.toolName}
  result={artifact.output || artifact.input}
  onUserAction={handleUserAction} // Available to all components
/>
```

## Creating Interactive Components

### Example: Transaction Signing Component

```typescript
interface TransactionSignerProps {
  transactionData: any;
  onUserAction?: (data: any) => Promise<void>;
}

export function TransactionSigner({
  transactionData,
  onUserAction,
}: TransactionSignerProps) {
  const [isSigning, setIsSigning] = useState(false);

  const handleSign = async () => {
    if (!onUserAction) return;

    setIsSigning(true);

    try {
      // Perform signing logic
      const signature = await signTransaction(transactionData);

      // Send signature back to agent
      await onUserAction({
        action: "signed",
        signature,
        transactionHash: signature.hash,
        timestamp: new Date().toISOString(),
      });

      // Component can update UI after successful send
    } catch (error) {
      console.error("Signing failed:", error);
    } finally {
      setIsSigning(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Transaction Approval Required</CardTitle>
      </CardHeader>
      <CardContent>
        <pre>{JSON.stringify(transactionData, null, 2)}</pre>
        <Button onClick={handleSign} disabled={isSigning}>
          {isSigning ? "Signing..." : "Sign Transaction"}
        </Button>
      </CardContent>
    </Card>
  );
}
```

### Component Contract

**Props your component receives:**

```typescript
interface YourComponentProps {
  // Your custom data from the agent
  ...yourCustomProps,

  // Automatically injected callback
  onUserAction?: (data: any) => Promise<void>;
}
```

**What to send back:**

```typescript
await onUserAction({
  // Required: Identify your component type
  componentType: "your-component-name",

  // Your response data (component-specific)
  action: "approve" | "reject" | "submit",

  // Any additional data
  ...yourData,

  // Recommended: Timestamp for tracking
  timestamp: new Date().toISOString(),
});
```

## Usage Patterns

### Pattern 1: Simple Approval

```typescript
export function ApprovalComponent({ message, onUserAction }: Props) {
  return (
    <div>
      <p>{message}</p>
      <button onClick={() => onUserAction({ action: "approve" })}>
        Approve
      </button>
      <button onClick={() => onUserAction({ action: "reject" })}>Reject</button>
    </div>
  );
}
```

### Pattern 2: Form Submission

```typescript
export function FormComponent({ fields, onUserAction }: Props) {
  const [formData, setFormData] = useState({});

  const handleSubmit = async () => {
    await onUserAction({
      componentType: "form",
      action: "submit",
      formData,
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* form fields */}
      <button type="submit">Submit</button>
    </form>
  );
}
```

### Pattern 3: Multi-Step Interaction

```typescript
export function MultiStepComponent({ steps, onUserAction }: Props) {
  const [currentStep, setCurrentStep] = useState(0);
  const [stepData, setStepData] = useState({});

  const handleStepComplete = async (data: any) => {
    const updatedData = { ...stepData, [`step${currentStep}`]: data };
    setStepData(updatedData);

    if (currentStep === steps.length - 1) {
      // Final step - send all data
      await onUserAction({
        componentType: "multi-step",
        action: "complete",
        allSteps: updatedData,
      });
    } else {
      // Move to next step
      setCurrentStep(currentStep + 1);
    }
  };

  return (
    <div>
      {/* Render current step */}
      <button onClick={() => handleStepComplete(currentStepData)}>
        {currentStep === steps.length - 1 ? "Finish" : "Next"}
      </button>
    </div>
  );
}
```

## Server-Side Integration

### Agent Response Format

To trigger user interaction, the agent should send an artifact with appropriate flags:

```json
{
  "kind": "artifact-update",
  "artifact": {
    "artifactId": "transaction-approval-1",
    "name": "tool-call-transaction-signer",
    "append": true,
    "parts": [
      {
        "kind": "data",
        "data": {
          // Your component data
          "transactionData": { "to": "0x...", "value": "1000" },

          // Future: Flag indicating interaction needed
          "awaitingInput": true,
          "requiresSignature": true
        }
      }
    ]
  }
}
```

### Receiving User Response

The agent will receive the user's response as a new message in the same context:

```json
{
  "role": "user",
  "parts": [
    {
      "kind": "data",
      "data": {
        "action": "signed",
        "signature": "0x...",
        "transactionHash": "0x...",
        "timestamp": "2025-01-15T10:30:00Z"
      }
    }
  ],
  "contextId": "same-context-id",
  "metadata": {
    "userInteraction": "true",
    "interactionType": "component-response"
  }
}
```

### Agent Processing

```typescript
// In your agent's message handler
if (message.metadata?.userInteraction === "true") {
  // This is a user response to a previous interaction
  const userData = message.parts[0].data;

  // Process the user's response
  if (userData.action === "signed") {
    // Continue with signed transaction
    await executeTransaction(userData.signature);
  }

  // Send completion response
  return {
    kind: "status-update",
    status: { state: "completed" },
    final: true,
  };
}
```

## Future Enhancements (Pending Server Clarification)

### 1. Awaiting Input Flag

Once the server standardizes the "awaiting input" flag, we can add:

```typescript
interface SessionMessage {
  // ... existing fields
  awaitingUserAction?: boolean;
  awaitingActionType?: "signature" | "input" | "approval" | "custom";
}
```

### 2. Session State Tracking

```typescript
// In session types
interface Session {
  // ... existing fields
  awaitingInput?: {
    artifactId: string;
    type: string;
    requiredBy?: Date;
  };
}
```

### 3. UI Indicators

- Highlight sessions awaiting user input in sidebar
- Show notification badges
- Add timeout warnings for time-sensitive actions

### 4. Structured Payloads

Define standardized payload formats for common interactions:

```typescript
interface SignaturePayload {
  type: "signature";
  transactionData: Transaction;
  requiredBy?: Date;
}

interface ApprovalPayload {
  type: "approval";
  message: string;
  options: string[];
}
```

## Testing

### Manual Test Case 1: Interactive Example Component

1. Connect to A2A agent
2. Send message that returns `tool-call-interactive-example` artifact
3. Component displays with input field and "Send Response" button
4. Enter text and click "Send Response"
5. Verify request sent in debug console
6. Agent should receive user response and continue

### Manual Test Case 2: Transaction Signing

1. Send message requesting transaction signature
2. Component displays transaction details
3. Click "Approve & Sign"
4. Verify signature sent to agent
5. Agent completes transaction
6. Component shows success state

### Debug Logging

Enable debug logging to trace the flow:

```javascript
// Console logs show:
[Main] User action from component: { action: 'approve', ... }
[A2ASession] Sending user interaction data to active task
[A2ASession] User interaction sent successfully
```

## Error Handling

### Component Not Receiving Callback

```typescript
if (!onUserAction) {
  console.error("No onUserAction callback provided");
  // Show error UI or disable interaction
  return <ErrorMessage>Cannot send response</ErrorMessage>;
}
```

### Network Errors

```typescript
try {
  await onUserAction(data);
} catch (error) {
  console.error("Failed to send user action:", error);
  setError("Failed to send response. Please try again.");
}
```

### No Active Session

```typescript
// In handleUserAction (page.tsx)
if (!activeSessionId || !contextId) {
  console.error("Cannot send - no active session");
  return; // Gracefully fail
}
```

## Security Considerations

1. **Validate Data:** Always validate user input before sending
2. **Sanitize:** Use DOMPurify or similar for any user-provided strings
3. **Timeout:** Consider implementing timeouts for interactions
4. **Replay Protection:** Include timestamps to prevent replay attacks
5. **Context Validation:** Server should verify contextId matches active task

## Best Practices

1. **Always check for callback:** `if (!onUserAction) return;`
2. **Show loading states:** While sending user action
3. **Disable after response:** Prevent duplicate submissions
4. **Clear error messages:** Help users understand what went wrong
5. **Log extensively:** Aid debugging of bidirectional flow
6. **Handle failures gracefully:** Don't crash on network errors

## API Reference

### `sendToActiveTask`

```typescript
sendToActiveTask(
  sessionId: string,
  agentEndpoint: string,
  contextId: string,
  data: any,
  metadata?: Record<string, string>
): Promise<void>
```

### `onUserAction` Callback

```typescript
onUserAction?: (data: any) => Promise<void>
```

**Data structure recommendations:**

```typescript
{
  componentType: string;      // Identify your component
  action: string;             // What user did
  [key: string]: any;         // Your custom data
  timestamp: string;          // ISO timestamp
}
```

## Files Modified

1. **`src/lib/hooks/useA2ASession.ts`**

   - Added `sendToActiveTask` function
   - Added to return type

2. **`src/components/ToolResultRenderer.tsx`**

   - Added `onUserAction` prop
   - Injects callback into component props

3. **`src/app/page.tsx`**

   - Added `handleUserAction` callback
   - Wires to all `ToolResultRenderer` instances
   - Manages session context

4. **`src/components/tools/InteractiveExample.tsx`** (NEW)
   - Example component demonstrating bidirectional communication
   - Shows approval/rejection pattern
   - Shows text input pattern

## Summary

✅ **Mechanism Implemented:** Bidirectional communication infrastructure is ready
✅ **Example Component:** InteractiveExample shows usage patterns  
⏳ **Awaiting Clarification:** Specific server flags and payload formats
🔜 **Next Steps:** Define standard interaction types once server protocol is finalized

The foundation is complete and ready to use. Components can now send data back to active A2A tasks!
