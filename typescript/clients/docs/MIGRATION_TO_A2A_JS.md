# Migration to @a2a-js/sdk

## Overview

The application has been updated to use `@a2a-js/sdk` for direct client-side A2A communication, eliminating the need for the backend proxy server.

## Changes Made

### 1. Updated `useA2AClient.ts`

- **Removed**: Socket.IO client dependency and backend proxy connection
- **Added**: Direct `A2AClient` from `@a2a-js/sdk`
- **Benefits**:
  - ✅ Simpler architecture (no backend proxy needed)
  - ✅ Direct browser-to-agent communication
  - ✅ Native streaming support with `for await...of`
  - ✅ Reduced complexity (~350 lines vs ~480 lines)
  - ✅ Better error handling
  - ✅ No more excessive logging

### 2. Key Features Retained

- ✅ Real-time streaming of reasoning and responses
- ✅ Word-by-word artifact streaming
- ✅ Context ID persistence across messages
- ✅ Tool invocation detection and rendering
- ✅ Debug logging
- ✅ Agent card fetching

## Installation Steps

### 1. Install the new package

```bash
cd /Users/davidcorrea/Projects/swagger/ember
npm install @a2a-js/sdk
```

### 2. (Optional) Remove Socket.IO dependency

```bash
npm uninstall socket.io-client
```

### 3. (Optional) Stop the backend server

The backend server (`server/server.js`) is no longer needed for A2A communication. You can stop it if it's running.

## How It Works

### Connection Flow

1. User enters agent URL (e.g., `https://dev.emberai.xyz`)
2. Client fetches agent card from `/.well-known/agent-card.json`
3. `A2AClient` is initialized with the agent URL
4. Ready to send messages!

### Message Flow

1. User sends a message
2. `A2AClient.sendMessage()` creates a streaming response
3. The client processes the event stream using `for await...of`
4. Events are handled in real-time:
   - `artifact-update`: Streams reasoning and response text
   - `status-update`: Updates task status
   - `task`: Initial task creation
5. Context ID is automatically persisted for conversation continuity

### Event Types Handled

- **`artifact-update`**: Streaming artifacts (reasoning, response, tool invocations)
- **`status-update`**: Task status changes (working, completed, etc.)
- **`task`**: Initial task submission confirmation

## API Comparison

### Old (Socket.IO + Backend)

```typescript
// Connect to local backend
const socket = io("http://localhost:5001");

// Send message through Socket.IO
socket.emit("send_message", {
  message: "Hello",
  id: messageId,
  contextId: contextId,
});

// Listen to events
socket.on("artifact_chunk", (data) => { ... });
socket.on("task_complete", (data) => { ... });
```

### New (@a2a-js/sdk)

```typescript
// Connect directly to agent
const client = new A2AClient("https://dev.emberai.xyz");

// Send message and handle streaming
const stream = await client.sendMessage({
  parts: [{ kind: "text", text: "Hello" }],
  contextId: contextId,
});

// Process events
for await (const event of stream) {
  if (event.kind === "artifact-update") { ... }
  if (event.kind === "status-update") { ... }
}
```

## Testing

1. Start the frontend:

```bash
npm run dev
```

2. Navigate to `http://localhost:3000`

3. Connect to the agent:

   - Enter URL: `https://dev.emberai.xyz`
   - Click "Connect"

4. Send a message and observe:
   - Real-time streaming of reasoning
   - Word-by-word response animation
   - Tool invocations (if any)
   - Debug logs in the Debug tab

## Benefits

### Performance

- ✅ **Reduced latency**: Direct client-to-agent communication
- ✅ **No backend overhead**: One less service to maintain
- ✅ **Native browser streaming**: Built-in SSE support

### Maintainability

- ✅ **Simpler codebase**: ~130 fewer lines of code
- ✅ **Less infrastructure**: No backend server required
- ✅ **Better error messages**: Direct feedback from agent

### Developer Experience

- ✅ **Easier debugging**: All logs in browser console
- ✅ **Hot reload works**: No need to restart backend
- ✅ **TypeScript support**: Full type safety with SDK

## Troubleshooting

### CORS Errors

If you encounter CORS errors, the A2A agent needs to allow requests from your origin:

```
Access-Control-Allow-Origin: http://localhost:3000
```

### Connection Timeout

If the connection times out, check:

1. Agent URL is correct
2. Agent card is accessible
3. Network connectivity

### Streaming Not Working

If streaming doesn't work:

1. Verify agent supports `message/stream` method
2. Check browser console for errors
3. Ensure agent returns proper SSE format

## Rollback (if needed)

If you need to rollback to the Socket.IO version:

1. Restore the old `useA2AClient.ts` from git history
2. Reinstall Socket.IO: `npm install socket.io-client`
3. Start the backend server: `cd server && npm start`
4. The frontend will connect to `http://localhost:5001` again

## Next Steps

Consider:

1. Removing the `server/` directory entirely
2. Updating documentation to reflect direct connection
3. Removing backend-specific environment variables
4. Adding retry logic for failed connections
5. Implementing connection pooling if needed

## Questions?

Refer to the official documentation:

- [@a2a-js/sdk Documentation](https://github.com/a2a-js/sdk)
- [A2A Protocol Specification](https://a2a-protocol.org)
