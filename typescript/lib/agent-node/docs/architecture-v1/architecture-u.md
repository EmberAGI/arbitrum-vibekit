Short answer: yes—wrapping **A2A behind an MCP server** is often the smoother front-door for LLM hosts (Claude Code, IDEs, your web UI) because they already “speak” MCP tools/resources/prompts. The LLM then calls the remote A2A agent _as if it were just another MCP tool_.

Here’s a tight blueprint you can copy.

# When this wins

- Your UI/host is MCP-native: automatic tool discovery, prompts UI, resources, progress notifications.
- You want one uniform “tool registry” (MCP) that happens to delegate to remote agents (A2A) under the hood.
- You want **MCP elicitations** to collect extra inputs when the downstream A2A task pauses with **input-required**.

# Conceptual mapping

| MCP concept       | How it fronts A2A                                                                                                                              |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tool**          | Calls an A2A **skill** or posts a **message** to start/continue a task.                                                                        |
| **Resource**      | Addressable views over A2A **artifacts** and long-lived **task logs** (e.g., `a2a://tasks/{id}/artifacts/{aid}` exposed via `resources/read`). |
| **Prompt**        | Pre-filled request templates that pick an A2A skill and gather parameters.                                                                     |
| **Elicitation**   | Translate A2A `input-required` / `auth-required` → MCP **elicitation** with a JSON schema “form.”                                              |
| **Notifications** | Stream A2A task status/progress → MCP **progress** + `resources/updated` for artifacts.                                                        |

# Minimal tool surface (server-facing contract)

Create an MCP server with these tools (names are suggestions):

1. `a2a/skills.list`
   Returns the remote agent’s skills (so hosts can drive UX, or you can generate MCP prompts dynamically).

2. `a2a/task.start`
   **input:** `{ skill?: string, message: { parts:[...] }, options?: { idempotencyKey?: string, priority?: string } }`
   **behavior:** Starts an A2A task; immediately returns `{ taskId }`. Also emits MCP **progress**.

3. `a2a/task.status`
   **input:** `{ taskId: string }` → `{ state:'submitted'|'working'|'input-required'|'completed'|'failed'|'canceled', progress?: number, artifacts?: [...], needs?: { schema, reason } }`
   On `input-required`, the handler issues an **elicitation** to the host with `schema`.

4. `a2a/task.cancel`
   Idempotent cancel → mirrors A2A `cancel`.

5. `a2a/artifact.get` (optional if you expose via Resources)
   **input:** `{ taskId, artifactId }` → `{ kind, data | uri }`.

# Resources (strongly recommended)

Expose stable URIs for A2A outputs:

- `a2a://tasks/{taskId}/artifact/{artifactId}` → `resources/read` returns the blob (text/json/binary).
- `a2a://tasks/{taskId}/log` → streaming/append-only log snapshot.
  Clients can `resources/subscribe` to get `notifications/resources/updated` when new chunks drop.

# Prompts (nice UX)

Autogenerate a prompt per skill at server start (or on `skills.list` change):

- `summarize (A2A)` → fields: `topic`, `tone`, `length`.
- The prompt handler just calls `a2a/task.start` with the mapped fields.

# Elicitation wiring (core of your question)

- When the A2A task flips to **`input-required`**, translate it to an MCP **elicitation** with a JSON schema form:
  - Example schema: `{"type":"object","properties":{"confirm":{"type":"boolean"}},"required":["confirm"]}`

- The host collects user input and re-invokes your **same** MCP tool handler with `elicitationResponse`, which you forward to A2A (`message` with a `DataPart`/form) to resume the task.

# Notifications & streaming

- Subscribe to A2A task events (SSE/webhook). Your MCP server translates:
  - A2A `status/progress` → MCP **progress notifications**.
  - New artifact/log chunk → `notifications/resources/updated` for the corresponding `a2a://…` resource.

- For hosts that render tool-stream output: you can also stream partial text via the MCP HTTP transport’s streaming result (if you’re using it). Otherwise prefer the **resource + notifications** pattern—it’s robust across stdio and HTTP.

# Error & state model

- Maintain a small in-memory map: `{ taskId → { a2aTaskId, agentUrl, lastState, artifactsIndex } }`.
- Use **idempotency keys** on `task.start` so repeated LLM retries don’t fan-out duplicate A2A tasks.
- Normalize failures: A2A errors → MCP tool error with `code`, `retryable`, `diagnostics`.

# Auth

- If A2A needs API keys/tokens, surface them as MCP **secrets**/config (or ask once via MCP elicitation and store encrypted on the server). Never push raw secrets back in artifacts/resources.

# Example: tiny TypeScript handler sketch (conceptual)

# Sequence (happy path)

```mermaid
sequenceDiagram
  participant Host/LLM
  participant MCP Server (your facade)
  participant A2A Agent

  Host/LLM->>MCP Server: tools/call a2a/task.start {skill, message}
  MCP Server->>A2A Agent: startTask(skill, message)
  A2A Agent-->>MCP Server: taskId (working)
  MCP Server-->>Host/LLM: {taskId} + progress notifications

  A2A Agent-->>MCP Server: artifact chunk
  MCP Server-->>Host/LLM: notifications/resources/updated a2a://tasks/{id}/artifact/{aid}

  A2A Agent-->>MCP Server: state=input-required {schema}
  MCP Server-->>Host/LLM: ELICIT {schema}
  Host/LLM->>MCP Server: elicit response (form)
  MCP Server->>A2A Agent: continueTask(form)

  A2A Agent-->>MCP Server: state=completed + artifacts
  MCP Server-->>Host/LLM: final status; resources ready
```

# Trade-offs vs the “other way” (MCP-behind-A2A)

**Pros of MCP-fronted A2A**

- Zero extra cognitive load for the LLM: “it’s just a tool.”
- You get MCP’s first-class **prompts/resources/notifications/elicitations** for free.
- Works in any MCP-capable client (IDE, desktop, web).

**Cons**

- You’re adapting A2A streaming/webhook semantics into MCP’s channel; some transports need a resource+notify shim (fine in practice).
- If your primary consumers are other _agents_ (not humans/hosts), A2A-fronted MCP can be simpler for pure agent-to-agent fabrics.

# Practical tip

Start with **MCP facade over A2A** as your default “front door.” Keep the reverse adapter (A2A facade over MCP) as an internal building block for agent fabrics. They’re complementary; you can run both facades off the same internal task bus.

If you want, I can turn this into a drop-in scaffold (TypeScript MCP server + A2A client) with the tool schemas, a resource URI parser, and a minimal progress/notification bridge.
