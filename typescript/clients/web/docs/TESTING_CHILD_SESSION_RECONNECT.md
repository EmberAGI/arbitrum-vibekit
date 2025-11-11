# Testing Child Session Reconnection

## What Changed

**Critical Fix**: Removed the `setTimeout` delay and now call `reconnectToStream()` **immediately and synchronously** when a child task is detected.

Previously:
```typescript
setTimeout(() => {
    reconnectToStream({ ... });
}, 100);
```

Now:
```typescript
reconnectToStream({ ... }); // Called immediately
```

## How to Test

### Step 1: Open Browser Console
Open DevTools (F12) and watch the console while testing.

### Step 2: Dispatch a Workflow
Send a message that triggers a workflow dispatch (e.g., "execute USDAI strategy").

### Step 3: Watch for These Logs

#### When Child Task is Detected:
```
[Main] ===== CHILD TASK DETECTED =====
[Main] Parent Session: session-conv-1234567890
[Main] Child Task ID: task-019a036b-3de1-749a-a5a0-1fd8fb68708d
[Main] Context ID: fe5b84e2-9d4c-4810-be51-96ae4e63c4ad
[Main] Workflow Name: USDai Pendle Allo
```

#### Session Setup:
```
[Main] ✅ Parent Agent Endpoint: https://dev.emberai.xyz/a2a
[Main] ✅ Child Session Created: session-conv-9876543210
[Main] ✅ Session setup complete, initiating reconnection...
[Main] 🔌 Calling reconnectToStream NOW...
[Main] ✅ reconnectToStream called successfully
```

#### As Workflow Executes:
```
[Main] 📩 Child task message received: { sessionId: 'session-conv-...', content: '...' }
[Main] 📊 Child task status update: { sessionId: 'session-conv-...', status: 'working' }
[Main] 🔧 Child task tool invocation: strategy-input-display
[Main] 📩 Child task message received: ...
```

### Step 4: Check Child Tab

The child tab should show:
1. ✅ Tab created with workflow name
2. ✅ Artifacts rendering (JsonViewer components)
3. ✅ Status updates (if workflow pauses for input)
4. ✅ Messages appearing as they stream

## Debugging Issues

### If No Child Tab Created
Check console for:
- `[Main] ===== CHILD TASK DETECTED =====` - if missing, parent isn't detecting child task
- `[Main] ❌ Parent session not found` - if present, session lookup is failing

### If Tab Created But Empty
Check console for:
- `[Main] 🔌 Calling reconnectToStream NOW...` - if missing, reconnection isn't happening
- `[Main] ✅ reconnectToStream called successfully` - if missing, call failed
- Any error messages from `[A2ASession]` logs

### If reconnectToStream Not Called
Check:
- Is `reconnectToStream` in the dependency array of `handleChildTask`?
- Are there any errors in the console before the reconnection attempt?
- Is the parent session's agentEndpoint set correctly?

### If No Events Received
Check:
- Network tab - is there a POST request to `/a2a` with method `tasks/resubscribe`?
- Response from A2A server - is it streaming events?
- Look for `[A2ASession] Resubscribe Event:` logs in console

## Expected Flow

1. **Parent Dispatches Workflow**
   - Parent task receives child task ID
   - `onChildTaskDetected` callback fires

2. **Child Session Created**
   - New tab appears immediately
   - Console shows "Child Session Created"

3. **Reconnection Happens Immediately**
   - Console shows "Calling reconnectToStream NOW"
   - A2A request sent to server

4. **Events Stream In**
   - Console shows message/status/artifact logs
   - Artifacts render in child tab as JsonViewer components

5. **Workflow Completes or Pauses**
   - If pauses: Session status shows "waiting"
   - If completes: Session status shows "completed"

## Common Issues

### Issue: "reconnectToStream is not a function"
**Solution**: Check that `reconnectToStream` is imported from `useA2ASession` and included in dependencies.

### Issue: "sessions[sessionId] is undefined" in callbacks
**Solution**: This is expected - callbacks use fresh state from hooks, not captured state.

### Issue: Child tab shows but stays empty
**Solution**: Check Network tab for A2A request. If request is made but no response, issue is server-side.

### Issue: Artifacts not rendering
**Solution**: Check that artifacts are being added to message via `artifacts` field, not just `toolInvocation`.

## Success Criteria

✅ Child tab created immediately when parent detects child task
✅ Console shows "Calling reconnectToStream NOW"
✅ Network tab shows POST to /a2a with tasks/resubscribe
✅ Console shows artifact/message events streaming in
✅ Child tab renders artifacts using JsonViewer
✅ Workflow can pause and resume with bidirectional communication

