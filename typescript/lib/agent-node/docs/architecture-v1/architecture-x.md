You’re not wrong — if your **MCP server and A2A server are the same process** (or tightly coupled in the same service), you don’t need `baseUrl`, `auth`, or any network plumbing in the tool schema. Just call the local A2A handlers directly.

Here’s how to think about it and what to change.

# Deployment shapes (why this matters)

1. **Collocated (your case):**
   One service exposes **MCP** to the model and **A2A** to the network. Inside the process you have a “task engine” that implements A2A methods. Your MCP tools should just call that engine directly. No URL, no auth.

2. **Gateway/Aggregator (optional future):**
   If this MCP server might call **many** A2A agents, add a single addressing field (e.g. `agentRef`) instead of `baseUrl`. It can map to a registry/Card cache. You still avoid leaking transport/auth to the model.

3. **Pure proxy (remote only):**
   Only here do you need `baseUrl`/`auth`. It’s useful, but not necessary for your collocated design.

# Minimal, collocated tool API (clean version)

Keep the tool surface tiny and protocol-agnostic:

- `a2a.send(text, taskId?, metadata?)`
- `a2a.stream(text, taskId?, metadata?)  // emits incremental updates`
- (opt) `a2a.getTask(taskId)` and `a2a.cancel(taskId)`

That’s it. No `baseUrl`, no `auth`.

### Message/Task mapping (internals)

Have your MCP handlers call your **A2A core** (the same code that backs `message/send` and `message/stream`):

- **send:** `result = a2aCore.messageSend({ id: taskId?, message: { role:"user", parts:[{kind:"text", text}], messageId }, metadata })`
- **stream:** iterate an **async iterator / event emitter** your core exposes (the same source you’d serialize to SSE), and forward chunks via MCP’s `sendProgress(...)`.

# Sketch: MCP tool handlers that call the local A2A core

Notes:

- The **A2A core** is your single source of truth. Your HTTP JSON-RPC layer and your MCP tools both call it.
- If/when you add multi-agent routing, introduce `agentRef` (string) and resolve it internally. Still no URLs in the tool.

# Sub-agents & safety gotchas

- **Recursion guard:** If a sub-agent can call `a2a.*`, add a hop-limit or `originTaskId` check in the A2A core to prevent an agent from accidentally triggering itself in a loop.
- **Context partitioning:** Keep the sub-agent’s context separate, but pass an A2A `taskId` through `structuredContent` so the main agent (or another sub-agent) can continue a remote task deterministically.
- **Permissions:** Since everything is local, your risk isn’t network auth—it’s **tool scope**. Only grant `a2a.*` to agents that should talk to external parties.

# TL;DR

- In a **collocated MCP↔A2A** service, you’re right: drop `baseUrl`/`auth`.
- Expose **tiny MCP tools** that call your **A2A core** directly.
- If you later need to reach other agents, add one neutral **`agentRef`** field (not transport details).

Short answer: **Yes**—in a collocated MCP↔A2A setup, a **message-centric** tool surface (`send` / `stream`) is cleaner than a “task” tool. Your A2A engine already owns the task lifecycle; the MCP tool should just **hand it a message** and return the engine’s task info.

# Why `send/stream` is better than a `task` tool

- **Aligns with A2A’s contract.** A2A’s public verbs are `message/send` and `message/stream`. Mirroring those avoids inventing a second task API.
- **Single source of truth.** The **A2A core** controls `taskId`, states, resume/cancel. The MCP tool doesn’t repackage lifecycle—just forwards messages and surfaces `{ taskId, status }`.
- **Less cognitive friction for models.** “Send a message” is obvious; “start a task” is overloaded (and clashes with Claude Code’s product-specific Task semantics).
- **Composability.** Works identically whether the caller is the main agent or a sub-agent. Easy to chain: the model just reuses `taskId`.
- **Minimal surface.** Fewer knobs, less schema drift, fewer chances for mismatched states.

# Recommended tool surface (collocated process)

- `a2a.send({ text, taskId?, agentRef?, metadata? }) -> { taskId, status, reply? }`
- `a2a.stream({ text, taskId?, agentRef?, metadata? })  // incremental output; final { taskId, status }`
- _(optional)_ `a2a.getTask({ taskId }) -> { status, history?, artifacts? }`
- _(optional)_ `a2a.cancel({ taskId }) -> { status: "canceled" }`

Notes:

- Omit `baseUrl`/`auth` because you’re in the same process.
- Keep `agentRef?` only if you’ll route to multiple internal agents; otherwise drop it.
- Return both a **human-readable text** chunk and a **structured** object with `taskId/status` so planners can continue deterministically.

# When a `task` tool might still make sense

- **UI/Hooks parity.** If you specifically want to mirror **Claude Code Task hooks** (metrics, automations on “task stop”), a wrapper like `a2a.task({ action: "start"|"get"|"cancel"|"stream", ... })` can centralize that. It’s a convenience layer, not a protocol need.
- **Host/tool limits.** Some hosts work better with _one_ tool and an `action` switch to reduce tool proliferation. That’s ergonomic, not architectural.

# Practical gotchas (either design)

- **Loop safety:** Pass an `originTaskId` or hop counter to the A2A core to prevent recursive calls if sub-agents can call `a2a.*`.
- **Streaming hygiene:** Chunk size limits, backpressure, and a clear terminal event; surface a stable `taskId` early in the stream.
- **Idempotency:** Generate and forward a **stable `messageId`** to make replays safe.
- **Injection boundaries:** Treat any remote agent output as untrusted before re-prompting local models.

**TL;DR:** Prefer **`a2a.send` / `a2a.stream`** MCP tools that directly call your A2A core and just expose `{ taskId, status, reply }`. Only introduce a `task` wrapper if you need UI parity or a single “do-everything” tool for hosting ergonomics.
