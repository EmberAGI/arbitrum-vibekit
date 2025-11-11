# Bidirectional Communication - Corrections Summary

## Updates Based on Server Specifications

This document summarizes the corrections made to match the actual A2A server protocol.

## Key Corrections Made

### 1. Changed from `message/send` to `message/stream` ✅

**Before:**

```typescript
method: "message/send",  // Non-streaming
Accept: "application/json"
```

**After:**

```typescript
method: "message/stream",  // Streaming continuation
Accept: "text/event-stream"
```

**Why:** A2A requires streaming even for user responses to continue the same task context.

**Files Changed:**

- `src/lib/hooks/useA2ASession.ts` - Line 947

---

### 2. Added `input-required` and `auth-required` Detection ✅

**Before:**

```typescript
// No special handling for paused states
```

**After:**

```typescript
if (state === 'input-required' || state === 'auth-required') {
  console.log('[A2ASession] Task paused - awaiting user input:', state);
  onStatusUpdate(sessionId, 'waiting', {
    awaitingInput: true,
    awaitingInputType: state,
    inputSchema: event.inputSchema,
    statusMessage: event.status.message,
  });
}
```

**Why:** Tasks pause with specific status updates, not custom flags in artifacts.

**Files Changed:**

- `src/lib/hooks/useA2ASession.ts` - Lines 396-407 (sendMessage)
- `src/lib/hooks/useA2ASession.ts` - Lines 824-835 (reconnectToStream)

---

### 3. Updated `sendToActiveTask` to Accept Callbacks ✅

**Before:**

```typescript
sendToActiveTask(
  sessionId: string,
  agentEndpoint: string,
  contextId: string,
  data: any,
  metadata?: Record<string, string>
): Promise<void>
```

**After:**

```typescript
sendToActiveTask(
  sessionId: string,
  agentEndpoint: string,
  contextId: string,
  data: any,
  onMessage: (sessionId, messageId, content, sender, updates) => string,
  onStatusUpdate: (sessionId, status, data?) => void,
  metadata?: Record<string, string>
): Promise<void>
```

**Why:** Streaming responses need callbacks to handle agent's continued messages.

**Files Changed:**

- `src/lib/hooks/useA2ASession.ts` - Interface (lines 47-61)
- `src/lib/hooks/useA2ASession.ts` - Implementation (lines 908-923)
- `src/app/page.tsx` - Usage (lines 507-541)

---

### 4. Clarified Data Flow: Artifact → Status Update ✅

**Server Flow:**

```
Step 1: Send artifact with data
{
  "kind": "artifact-update",
  "artifact": {
    "name": "delegations-to-sign",
    "parts": [{ "kind": "data", "data": {...} }]
  }
}

Step 2: Pause task
{
  "kind": "status-update",
  "status": { "state": "input-required" },
  "inputSchema": { ... }
}
```

**Client Response:**

```typescript
// Component already has artifact data
// User interacts
await onUserAction({ delegations: [...signed...] });

// Client sends via message/stream with same contextId
```

**Documentation:**

- Created `BIDIRECTIONAL_UPDATED_FLOW.md` with detailed examples

---

## Comparison Table

| Feature                        | Before               | After                                             |
| ------------------------------ | -------------------- | ------------------------------------------------- |
| **Method**                     | `message/send`       | `message/stream`                                  |
| **Response Type**              | JSON                 | Server-Sent Events                                |
| **Pause Detection**            | Undefined            | `status.state` = `input-required`/`auth-required` |
| **Task Continuation**          | Same contextId       | Same contextId (confirmed)                        |
| **Data + Pause**               | Combined in artifact | Artifact first, then status update                |
| **Input Schema**               | Not specified        | Provided in status update via `inputSchema`       |
| **Streaming After User Input** | Not handled          | Full stream processing                            |

---

## What Stayed the Same

✅ Using `contextId` to continue same task  
✅ `onUserAction` callback prop for components  
✅ `ToolResultRenderer` integration  
✅ Example `InteractiveExample` component  
✅ Session management infrastructure

---

## Testing Checklist

### Test Scenario: Delegation Signing

**Expected Flow:**

1. ✅ Artifact arrives with delegations
   - Component renders: `DelegationSigner`
   - Shows delegation details

2. ✅ Status update arrives
   - `state: "input-required"`
   - Session status → `"waiting"`
   - `awaitingInput: true`

3. ✅ User signs delegations
   - Component calls `onUserAction({ delegations: [...] })`

4. ✅ Client sends via `message/stream`
   - Method: `"message/stream"`
   - Same `contextId`
   - Metadata: `userInteraction: "true"`

5. ✅ Stream continues
   - Agent receives signed delegations
   - Task continues execution
   - More events arrive (artifacts, status updates)

6. ✅ Task completes
   - Final status update: `state: "completed"`
   - Session status → `"completed"`

### Debug Logs to Verify

```
[A2ASession] Event: artifact-update - delegations-to-sign
[A2ASession] Event: status-update - input-required
[A2ASession] Task paused - awaiting user input: input-required
[Main] User action from component: { delegations: [...] }
[A2ASession] Sending user interaction data to active task
[A2ASession] User interaction sent, processing stream...
[A2ASession] Event: status-update - completed
```

---

## Files Modified

### Core Implementation

1. **`src/lib/hooks/useA2ASession.ts`**
   - Changed method to `message/stream`
   - Added `input-required`/`auth-required` detection (2 places)
   - Updated `sendToActiveTask` signature
   - Added stream processing setup

2. **`src/app/page.tsx`**
   - Updated `handleUserAction` to pass callbacks
   - Added `onMessage` inline callback
   - Added `onStatusUpdate` inline callback with await detection

### Documentation

3. **`BIDIRECTIONAL_UPDATED_FLOW.md`** (NEW)
   - Complete server flow explanation
   - Example delegation signing scenario
   - Comparison table

4. **`BIDIRECTIONAL_QUICK_START.md`** (UPDATED)
   - Added "Recent Update" section
   - Updated server-side flow section
   - Updated status to show completion

5. **`BIDIRECTIONAL_CORRECTIONS_SUMMARY.md`** (NEW - this file)
   - Summary of all changes
   - Before/after comparisons

---

## Migration Notes

### If You Had Previous Code

**Change 1: Update sendToActiveTask calls**

```typescript
// OLD
await sendToActiveTask(sessionId, endpoint, contextId, data);

// NEW
await sendToActiveTask(sessionId, endpoint, contextId, data, onMessage, onStatusUpdate);
```

**Change 2: No other changes needed!**

Components don't need updates - they already use `onUserAction` correctly.

---

## Summary

✅ **All corrections implemented**  
✅ **Matches A2A server protocol**  
✅ **No breaking changes to components**  
✅ **Full streaming support**  
✅ **Proper pause detection**

**Status:** Ready for production use with A2A agents that support paused tasks!

---

## References

- **Core Implementation:** `src/lib/hooks/useA2ASession.ts`
- **Usage Example:** `src/app/page.tsx` - `handleUserAction`
- **Component Example:** `src/components/tools/InteractiveExample.tsx`
- **Detailed Flow:** `BIDIRECTIONAL_UPDATED_FLOW.md`
- **Quick Start:** `BIDIRECTIONAL_QUICK_START.md`
