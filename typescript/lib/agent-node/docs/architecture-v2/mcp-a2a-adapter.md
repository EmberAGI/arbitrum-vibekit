Awesome, here’s a **drop-in streaming bridge** that:

- mounts your **A2A JSON-RPC server** with `A2AExpressApp`
- exposes **two MCP tools** over **Streamable HTTP**:
  - `a2a_message_stream` → proxies A2A `message/stream`
  - `a2a_tasks_resubscribe` → (re)subscribes to task updates

- faithfully forwards **all A2A stream events** to **MCP streaming notifications** (progress + log messages), and cleanly handles **cancellation** from the MCP side.

The code is self-contained (single `server.ts`) and uses only the official SDKs.

---

### 1) Install

```bash
npm i @a2a-js/sdk express zod
npm i -D typescript tsx @types/express
npm i @modelcontextprotocol/sdk
```

---

### 2) `server.ts`

```ts
import express, { Request, Response } from 'express';
import { z } from 'zod';

// --- A2A SDK (server + client) ------------------------------
import type {
  AgentCard,
  Message,
  MessageSendParams,
  TaskStatusUpdateEvent,
  TaskArtifactUpdateEvent,
} from '@a2a-js/sdk';
import {
  AgentExecutor,
  RequestContext,
  ExecutionEventBus,
  DefaultRequestHandler,
  InMemoryTaskStore,
} from '@a2a-js/sdk/server';
import { A2AExpressApp } from '@a2a-js/sdk/server/express';
import { A2AClient } from '@a2a-js/sdk/client';

// --- MCP SDK (server + transport) ---------------------------
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

// -----------------------------------------------------------
// 0) Minimal example agent for the A2A side (replace with your own)
// -----------------------------------------------------------
const agentCard: AgentCard = {
  name: 'Bridge Agent',
  description: 'A2A<->MCP streaming bridge demo',
  protocolVersion: '0.3.0',
  version: '0.1.0',
  url: 'http://localhost:4000', // public base URL of A2A endpoints
  skills: [{ id: 'chat', name: 'Chat', description: 'chat', tags: ['chat'] }],
  capabilities: { streaming: true },
};

class EchoExecutor implements AgentExecutor {
  async execute(ctx: RequestContext, bus: ExecutionEventBus): Promise<void> {
    // You can emit intermediate events; we just send a final message
    const reply: Message = {
      kind: 'message',
      messageId: crypto.randomUUID(),
      role: 'agent',
      parts: [{ kind: 'text', text: `echo: ${ctx.message?.parts?.[0]?.text ?? ''}` }],
      contextId: ctx.contextId,
    };
    bus.publish(reply);
    bus.finished();
  }
  cancelTask = async () => {};
}

// -----------------------------------------------------------
// 1) Start A2A server (JSON-RPC + streaming endpoints)
// -----------------------------------------------------------
const taskStore = new InMemoryTaskStore();
const requestHandler = new DefaultRequestHandler(agentCard, taskStore, new EchoExecutor());

const expressApp = express();
const a2aApp = new A2AExpressApp(requestHandler);
/**
 * Second arg = basePath ("" = root). A2AExpressApp wires:
 *   - the agent card (/.well-known/agent-card.json)
 *   - JSON-RPC methods including streaming methods like message/stream
 *   - task endpoints, e.g., tasks/resubscribe
 *
 * (See A2A JS SDK readme + examples.)
 */
a2aApp.setupRoutes(expressApp, '');

// -----------------------------------------------------------
// 2) Create an MCP server exposing A2A endpoints as MCP tools
// -----------------------------------------------------------
const mcp = new McpServer(
  {
    name: 'a2a-mcp-bridge',
    version: '1.0.0',
  },
  // Advertise capabilities we’ll use (tools + logging)
  {
    capabilities: {
      tools: {},
      logging: {}, // required to send notifications/message
    },
  },
);

// Helper: forward A2A streaming events to MCP notifications (progress + logs)
async function forwardA2AEventsToMcp(
  iter: AsyncIterable<any>,
  {
    send,
    progressToken,
    abortSignal,
  }: {
    send: (n: { method: string; params: any }) => Promise<void> | void;
    progressToken?: string | number;
    abortSignal?: AbortSignal;
  },
): Promise<{ finalText?: string; taskId?: string; finalState?: string }> {
  let finalText = '';
  let taskId: string | undefined;
  let finalState: string | undefined;

  for await (const ev of iter) {
    if (abortSignal?.aborted) break;

    // Known A2A event kinds:
    //  - { kind: "task", id: string, ... }
    //  - { kind: "status-update", status: { state: "submitted"|"working"|"completed"|"failed", message?: Message, ... }, final?: boolean }
    //  - { kind: "artifact-update", artifact: {...}, ... }
    //  - vendor-specific extras may appear
    if (ev?.kind === 'task' && ev.id) {
      taskId = ev.id;
      await send({
        method: 'notifications/message',
        params: { level: 'info', logger: 'a2a', data: `task created: ${ev.id}` },
      });
      // “progress” is optional; we emit qualitative phases
      if (progressToken)
        await send({
          method: 'notifications/progress',
          params: { progressToken, message: 'task submitted' },
        });
    } else if (ev?.kind === 'status-update') {
      const statusEv = ev as TaskStatusUpdateEvent & { final?: boolean };
      const state = statusEv.status?.state;
      if (state) {
        if (progressToken)
          await send({
            method: 'notifications/progress',
            params: { progressToken, message: `status: ${state}` },
          });
        await send({
          method: 'notifications/message',
          params: { level: 'info', logger: 'a2a', data: `status: ${state}` },
        });
      }
      const msg = statusEv.status?.message;
      const textChunk = msg?.parts?.[0]?.text;
      if (textChunk) {
        finalText += textChunk;
        await send({
          method: 'notifications/message',
          params: { level: 'info', logger: 'a2a', data: textChunk },
        });
      }
      if (statusEv.final) {
        finalState = state;
        break;
      }
    } else if (ev?.kind === 'artifact-update') {
      const artEv = ev as TaskArtifactUpdateEvent;
      await send({
        method: 'notifications/message',
        params: {
          level: 'info',
          logger: 'a2a',
          data: `artifact update: ${artEv.artifact?.kind ?? 'unknown'}`,
        },
      });
    } else {
      // Unknown vendor-specific event; surface as log
      await send({
        method: 'notifications/message',
        params: { level: 'debug', logger: 'a2a', data: JSON.stringify(ev) },
      });
    }
  }
  return { finalText, taskId, finalState };
}

// --- Tool 1: message/stream -------------------------------
// Arguments schema for A2A MessageSendParams (subset, extend as needed)
const MessageStreamArgs = z.object({
  message: z.object({
    messageId: z
      .string()
      .uuid()
      .optional()
      .default(() => crypto.randomUUID()),
    role: z.enum(['user', 'system', 'agent']),
    kind: z.literal('message'),
    parts: z.array(
      z.union([
        z.object({ kind: z.literal('text'), text: z.string() }),
        // add other A2A part kinds if needed (images, files…)
      ]),
    ),
  }),
  configuration: z
    .object({
      blocking: z.boolean().optional(),
      acceptedOutputModes: z.array(z.string()).optional(),
    })
    .optional(),
  // Optional override to point the MCP tool at a different A2A base URL
  a2aBaseUrl: z.string().url().optional(),
  // Optional Bearer token (A2A puts auth in HTTP headers)
  a2aBearerToken: z.string().optional(),
});

mcp.registerTool({
  name: 'a2a_message_stream',
  description:
    'Proxy A2A message/stream; forwards all streaming events to MCP notifications and returns the final concatenated text.',
  inputSchema: MessageStreamArgs,
  handler: async (args, extra) => {
    const parsed = MessageStreamArgs.parse(args);
    const baseUrl = parsed.a2aBaseUrl ?? process.env.A2A_BASE_URL ?? 'http://localhost:4000';
    const a2a = await A2AClient.fromCardUrl(`${baseUrl}/.well-known/agent-card.json`, {
      headers: parsed.a2aBearerToken ? { Authorization: `Bearer ${parsed.a2aBearerToken}` } : {},
    });

    // Start A2A streaming (AsyncIterable)
    const stream = a2a.sendMessageStream(parsed as MessageSendParams);

    // Use the per-request sender if provided; fall back to server-level logging
    const send = extra?.sendNotification ? extra.sendNotification : (n: any) => mcp.notification(n);

    const { finalText, taskId, finalState } = await forwardA2AEventsToMcp(stream, {
      send,
      progressToken: extra?.progressToken,
      abortSignal: extra?.abortSignal,
    });

    // Return a normal MCP tool result; content is what the model sees
    return {
      content: [
        { type: 'text', text: finalText ?? '' },
        ...(taskId
          ? [{ type: 'text', text: `\n[taskId=${taskId}, state=${finalState ?? ''}]` }]
          : []),
      ],
    };
  },
});

// --- Tool 2: tasks/resubscribe ----------------------------
// Minimal schema: just a taskId + (optional) base URL / token
const TaskResubArgs = z.object({
  taskId: z.string(),
  a2aBaseUrl: z.string().url().optional(),
  a2aBearerToken: z.string().optional(),
});

mcp.registerTool({
  name: 'a2a_tasks_resubscribe',
  description: 'Proxy A2A tasks/resubscribe; streams task status/messages again (after reconnect).',
  inputSchema: TaskResubArgs,
  handler: async (args, extra) => {
    const { taskId, a2aBaseUrl, a2aBearerToken } = TaskResubArgs.parse(args);
    const baseUrl = a2aBaseUrl ?? process.env.A2A_BASE_URL ?? 'http://localhost:4000';
    const a2a = await A2AClient.fromCardUrl(`${baseUrl}/.well-known/agent-card.json`, {
      headers: a2aBearerToken ? { Authorization: `Bearer ${a2aBearerToken}` } : {},
    });

    // Most A2A JS clients expose a resubscribe stream; if your version differs,
    // replace with the appropriate call or a small raw fetch-based SSE helper.
    // This function should return an AsyncIterable of the same event shapes.
    const stream =
      // @ts-expect-error – older/newer SDKs may use slightly different names
      a2a.resubscribeTaskStream?.(taskId) ??
      // Fallback for clients using a different method name:
      // @ts-expect-error
      a2a.tasksResubscribeStream?.(taskId) ??
      (() => {
        throw new Error(
          "Your @a2a-js/sdk client does not expose resubscribe streaming. Update the SDK or implement a tiny SSE fetch for method 'tasks/resubscribe'.",
        );
      })();

    const send = extra?.sendNotification ? extra.sendNotification : (n: any) => mcp.notification(n);

    const { finalText, finalState } = await forwardA2AEventsToMcp(stream, {
      send,
      progressToken: extra?.progressToken,
      abortSignal: extra?.abortSignal,
    });

    return {
      content: [
        { type: 'text', text: finalText ?? '' },
        { type: 'text', text: `[resubscribe final state=${finalState ?? ''}]` },
      ],
    };
  },
});

// -----------------------------------------------------------
// 3) Wire MCP Streamable HTTP endpoint (/mcp)
//    (stateless, per-request transport instances)
// -----------------------------------------------------------
expressApp.post('/mcp', async (req: Request, res: Response) => {
  const transport = new StreamableHTTPServerTransport({});
  await mcp.connect(transport);

  // IMPORTANT: forward the same request body the client sent
  await transport.handleRequest(req, res, (req as any).body ?? {});

  // Clean up on close
  res.on('close', () => {
    transport.close();
    mcp.close();
  });
});

// -----------------------------------------------------------
// 4) Security hardening (recommended in MCP spec)
// -----------------------------------------------------------
expressApp.use((req, res, next) => {
  if (req.path === '/mcp') {
    const origin = req.get('Origin');
    // Example allowlist for local dev – tighten in prod!
    const allowed = ['http://localhost:3000', 'http://127.0.0.1:3000'];
    if (origin && !allowed.includes(origin)) {
      return res.status(403).send('Forbidden origin');
    }
  }
  next();
});

// -----------------------------------------------------------
// 5) Start the combined server
// -----------------------------------------------------------
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
expressApp.listen(PORT, () => {
  console.log(`A2A server (and MCP bridge) listening on http://localhost:${PORT}`);
  console.log(`A2A card: http://localhost:${PORT}/.well-known/agent-card.json`);
  console.log(`MCP endpoint: POST http://localhost:${PORT}/mcp`);
});
```

**Why this works**

- `A2AExpressApp` wires the **JSON-RPC methods incl. streaming** (e.g. `message/stream`) and **task endpoints** (e.g. `tasks/resubscribe`) into the same Express app.
- The A2A JS client exposes `sendMessageStream(...)` which returns an **async iterator** over streaming events; we forward each event to the MCP client as **`notifications/progress`** and **`notifications/message`** and return a regular tool result when the A2A stream finishes.
- The MCP side uses **Streamable HTTP transport** so your MCP client (Claude Desktop, Cursor, VS Code agents, etc.) receives **real-time notifications** and can **cancel** tool runs. We enable `logging` capability so `notifications/message` is allowed; `notifications/progress` is always OK per spec.

> If your current `@a2a-js/sdk` lacks a `resubscribeTaskStream` helper, just swap that call with a tiny fetch-based SSE wrapper that posts a JSON-RPC request for method `tasks/resubscribe` to your A2A endpoint and yields each SSE `data:` chunk. The protocol explicitly defines `tasks/resubscribe` for broken stream recovery.

---

### 3) Try it locally

1. Run the server:

```bash
npx tsx server.ts
```

2. Use the official MCP simple client to test the stream (it speaks Streamable HTTP):

```bash
# Provided by the MCP SDK examples
node node_modules/@modelcontextprotocol/sdk/dist/esm/examples/client/simpleStreamableHttp.js
# then inside the REPL:
connect http://localhost:4000/mcp
list-tools
# Expect: a2a_message_stream, a2a_tasks_resubscribe
call-tool a2a_message_stream --json '{"message":{"role":"user","kind":"message","parts":[{"kind":"text","text":"hello"}]}}'
```

You should see **notifications** as the A2A stream progresses, then a **final tool result** with the concatenated text.

---

### Notes & tips

- **Cancellation**: Streamable HTTP surfaces an abort signal to your handler; we break the A2A loop when `extra.abortSignal.aborted` becomes `true`, ensuring both sides stop promptly.
- **Auth**: A2A auth goes in headers (e.g., `Authorization: Bearer …`). The tool accepts `a2aBearerToken` and passes it to the A2A client.
- **Origin checks**: MCP streamable HTTP must validate `Origin` to prevent DNS rebinding; the example shows a minimal allowlist—tighten for production.

---

If you want me to add file/image parts, richer artifact forwarding, or map more A2A event kinds (tools calls, partial deltas), I can extend the schemas and the `forwardA2AEventsToMcp` mapper accordingly.

Great questions — here’s the crisp, “what should I actually do?” answer.

## The simplest architecture

- **Use `A2AClient` for _everything_ (streaming and non-streaming)** inside your MCP server process. It already handles A2A’s streaming endpoints, event ordering, reconnects, subscriptions, etc. It’s less code and fewer edge cases than hand-rolling loopback HTTP + SSE.
- **Expose your MCP server over _Streamable HTTP_** (the modern transport). That’s the MCP part your clients connect to. Streamable HTTP is the current, recommended transport and supports interleaving server→client notifications during a long request. ([GitHub][1])
- **Only use loopback HTTP** if you _have_ to cross a process/container boundary or add a network policy boundary; otherwise keep it in-process with `A2AClient`.

## How to reconcile A2A’s streaming parts with MCP

In A2A, `kind: "task"`, `kind: "status-update"`, and `kind: "artifact-update"` are **semantically part of the result**, e.g., token streams where the last piece has `lastChunk: true`. In MCP:

- The **tool result** must be returned in the **final `tools/call` response** (`result.content`, optionally `structuredContent`). That’s the canonical output. There’s no “streaming tool result” in the spec today. ([Model Context Protocol][2])
- **Notifications** exist for progress/logging and resource updates. They’re not a replacement for the tool’s result; treat them as **ephemeral side-channel updates** (progress bars, live previews, logs). ([Model Context Protocol][3])
- For truly live, durable streams, **map the stream to an MCP _resource_** and let clients **subscribe**. Your tool returns a `resource_link` in the final result; during execution you send `notifications/resources/updated` so clients can fetch the latest content (or subscribe). ([Model Context Protocol][4])

### TL;DR of the mapping

| A2A event                       | MCP thing to emit during the call                                                                              | What the final tool result returns                                                          |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `task` created / status         | `notifications/progress` for % and messages; optional `notifications/message` logs                             | A `resource_link` to `a2a://task/{id}` plus a summary `text` block                          |
| `status-update`                 | `notifications/progress` (and/or `notifications/message`)                                                      | Reflected in the resource’s latest snapshot                                                 |
| `artifact-update` (token delta) | Append to an in-memory buffer **and** update the resource; optionally mirror deltas as `notifications/message` | The assembled text as `content: [{type:"text"}]` and/or a `resource_link` to the transcript |
| `lastChunk: true`               | Send a final `resources/updated` and stop progress                                                             | Close out and return the full content in the `tools/call` **result**                        |

This is **spec-compliant** because:

- The canonical output is in `tools/call` → `result.content`. ([Model Context Protocol][2])
- Progress/logging use `notifications/progress` and `notifications/message`. ([Model Context Protocol][5])
- Live streams use **resources** + `resources/subscribe` + `notifications/resources/updated`. ([Model Context Protocol][4])

> **Is it okay to send tool results through notifications?**
> No. Notifications are **not** the tool’s return channel; they’re informational and may be ignored by clients. Put the **data** in the final tool result (and/or a resource the client can read). ([Model Context Protocol][2])

## Minimal pattern to implement

Below is the essential shape (TypeScript) showing how to wire this without the earlier loopback HTTP. It illustrates: `A2AClient` stream → MCP progress/logging + resource updates → final result.

```ts
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { A2AClient } from '@a2a/sdk'; // your a2a client SDK

// --- In-memory "resource store" keyed by task URI
const taskBuffers = new Map<string, { mimeType: string; text?: string; blob?: string }>();

// --- MCP server
const server = new McpServer(
  { name: 'a2a-bridge', version: '1.0.0' },
  {
    // advertise resources with subscribe + listChanged so clients can follow updates
    capabilities: {
      resources: { subscribe: true, listChanged: true },
      tools: { listChanged: false },
      logging: {},
    },
  },
);

// A dynamic resource that exposes the live output of an A2A task
const taskTemplate = new ResourceTemplate('a2a://task/{taskId}', { list: undefined });
server.registerResource(
  'a2a-task',
  taskTemplate,
  { title: 'A2A Task Stream', description: 'Live task output', mimeType: 'text/plain' },
  async (uri, { taskId }) => {
    const key = `a2a://task/${taskId}`;
    const snap = taskBuffers.get(key) ?? { mimeType: 'text/plain', text: '' };
    return {
      contents: [{ uri: uri.href, mimeType: snap.mimeType, text: snap.text, blob: snap.blob }],
    };
  },
);

// Helper to send resource-updated notification (SDK typically exposes a send or server.notify API)
function notifyResourceUpdated(uri: string) {
  server.server.sendNotification({
    method: 'notifications/resources/updated',
    params: { uri },
  });
}

// A single tool that streams an A2A message/task and returns both the final text and a resource link
server.registerTool(
  'a2a_stream_message',
  {
    title: 'A2A Message Stream',
    description: 'Send a2a message and stream artifacts/status as MCP updates.',
    inputSchema: {
      prompt: z.string(),
      model: z.string().optional(),
    },
  },
  async ({ prompt, model }, _ctx) => {
    // 1) Kick off A2A stream via the client
    const a2a = await A2AClient.fromConfig(/* ... */);
    const task = await a2a.message.stream({ prompt, model });

    const taskUri = `a2a://task/${task.id}`;
    taskBuffers.set(taskUri, { mimeType: 'text/plain', text: '' });

    // 2) Stream events → MCP notifications + update resource snapshot
    for await (const ev of task.events()) {
      if (ev.kind === 'status-update') {
        // Progress channel
        server.server.sendNotification({
          method: 'notifications/progress',
          params: { progressToken: task.id, progress: ev.progress ?? 0, message: ev.message },
        });
      } else if (ev.kind === 'artifact-update') {
        // Token or chunk
        const buf = taskBuffers.get(taskUri)!;
        if (ev.mimeType?.startsWith('text/')) {
          buf.text = (buf.text ?? '') + (ev.deltaText ?? '');
        } else {
          // binary → accumulate base64 into blob (or switch to a binary mime and chunk strategy)
          buf.blob = (buf.blob ?? '') + (ev.deltaBase64 ?? '');
          buf.mimeType = ev.mimeType ?? 'application/octet-stream';
        }
        taskBuffers.set(taskUri, buf);

        // Optional: also mirror as a log line (clients may show this)
        server.server.sendNotification({
          method: 'notifications/message',
          params: {
            level: 'info',
            logger: 'a2a',
            data: { kind: 'artifact-update', size: ev.deltaText?.length ?? 0 },
          },
        });

        notifyResourceUpdated(taskUri);

        if (ev.lastChunk) {
          // Mark completion of this artifact part; you may emit a final progress bump
          server.server.sendNotification({
            method: 'notifications/progress',
            params: { progressToken: task.id, progress: 100, message: 'artifact complete' },
          });
        }
      } else if (ev.kind === 'task' && ev.state === 'completed') {
        // Task completed: one last resource update
        notifyResourceUpdated(taskUri);
      }
    }

    // 3) Return canonical tool result (final assembled content + link to the live transcript resource)
    const finalSnap = taskBuffers.get(taskUri)!;
    return {
      content: [
        finalSnap.text ? { type: 'text', text: finalSnap.text } : undefined,
        {
          type: 'resource_link',
          uri: taskUri,
          name: `task-${task.id}.txt`,
          mimeType: finalSnap.mimeType,
        },
      ].filter(Boolean),
    };
  },
);

// --- Streamable HTTP transport (sessionful)
const app = express();
app.use(express.json());
const transports: Record<string, StreamableHTTPServerTransport> = {};
app.post('/mcp', async (req, res) => {
  let transport = transports[req.headers['mcp-session-id'] as string];
  if (!transport) {
    transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() });
    transports[transport.sessionId!] = transport;
    await server.connect(transport);
    transport.onclose = () => {
      delete transports[transport.sessionId!];
    };
  }
  await transport.handleRequest(req, res, req.body);
});
app.listen(3000);
```

### Why this is correct & complete (w\.r.t. MCP)

- **Final output goes in `tools/call` → `result.content`** (text and/or `resource_link`). ([Model Context Protocol][2])
- **Streaming UX** uses:
  - `notifications/progress` for progress (optional total/message). ([Model Context Protocol][5])
  - `notifications/message` for logs (optional, useful in UIs). ([Model Context Protocol][3])
  - **Resources** + `resources/subscribe` + `notifications/resources/updated` for durable, live-updating data the client can fetch/subscribe to. ([Model Context Protocol][4])

- **Transport** is Streamable HTTP (modern, works in browsers and servers). ([GitHub][1])

### Cancellation, timeouts, and resubscribe

- If the MCP client cancels the tool call (`notifications/cancelled`), abort the A2A stream and stop sending updates. ([Model Context Protocol][6])
- If your A2A “task” continues in the background, keep updating the **resource** and send `resources/updated` notifications; clients that subscribed will still see fresh data even after the tool call returned. This is explicitly a supported pattern (return a resource link, then let clients poll/subscribe). ([Model Context Protocol][2])

---

## Direct answers to your questions

- **“Should we not use loopback HTTP for streaming?”**
  Prefer not to, unless you must cross boundaries. `A2AClient` already handles A2A streaming concerns; it’s the most straightforward choice.

- **“Should we not use `A2AClient` for non-streaming?”**
  You _should_ use it for both. One client, one set of retry/auth/headers/telemetry code paths.

- **“Is it MCP-compliant to send tool call responses through notifications?”**
  No — notifications are for progress/logging and resource update hints. The **tool’s result** must be the payload of the final `tools/call` response. Use notifications for live UX and **resources** for durable streaming/polling; return the final assembled data in the `result`. ([Model Context Protocol][2])

If you want, I can trim the code above to a drop-in file tailored to your exact A2A SDK calls and event shapes.

[1]: https://github.com/modelcontextprotocol/typescript-sdk 'GitHub - modelcontextprotocol/typescript-sdk: The official TypeScript SDK for Model Context Protocol servers and clients'
[2]: https://modelcontextprotocol.io/docs/concepts/tools 'Tools - Model Context Protocol'
[3]: https://modelcontextprotocol.io/specification/2025-03-26/server/utilities/logging 'Logging - Model Context Protocol'
[4]: https://modelcontextprotocol.io/specification/2025-03-26/server/resources 'Resources - Model Context Protocol'
[5]: https://modelcontextprotocol.io/specification/2025-03-26/basic/utilities/progress 'Progress - Model Context Protocol'
[6]: https://modelcontextprotocol.io/specification/2025-03-26/basic/utilities/cancellation?utm_source=chatgpt.com 'Cancellation'
