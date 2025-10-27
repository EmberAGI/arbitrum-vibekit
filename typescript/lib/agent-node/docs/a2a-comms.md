## A2A Communications Q&A (Transcript)

### Conversation

#### User (message 1)

- Read and learn about A2A from official docs and this resource: [A2A protocol: demystifying tasks vs messages](https://discuss.google.dev/t/a2a-protocol-demystifying-tasks-vs-messages/255879)
- When the A2A server Task moves to “input-required” state and requests input from client, how does that process precisely work? How does the client receive such a request and how does it respond to the server?
- I want to know for both streaming and non‑streaming scenarios (if it’s even different between them).

#### Assistant (reply 1)

##### A2A: Input‑required handshake (streaming and non‑streaming)

###### Non‑streaming (plain `message/send`, plus polling or webhooks)

**How you receive the request for input**

1. You call `message/send` (typically with `blocking: false`, the default).
2. The server returns a Task object. If the agent needs more info, the task’s `status.state` is `input-required` and the clarifying prompt is in `task.status.message` (an agent Message). You can also encounter `input-required` later while polling with `tasks/get`, or via a push webhook if you registered one.

- **Polling path**: keep calling `tasks/get` `{ id }` until the task hits `input-required` (or a terminal state).
- **Webhook path**: provide `configuration.pushNotificationConfig` on your initial send (or set it via `tasks/pushNotificationConfig/set`). The server POSTs task updates (including `input-required`) to your URL.

**How you respond**

- Send another `message/send`, including the same `taskId` (and `contextId` if present), with your answer as the user message. The server will then continue the task (it may complete, or ask for more input again). You can set `configuration.blocking: true` on this follow‑up if you want the call to wait for completion.

**Minimal JSON shapes (non‑streaming)**

Agent asks for input (server reply to your `message/send`, or `tasks/get` result):

```json
{
  "result": {
    "id": "TASK_ID",
    "contextId": "CTX",
    "status": {
      "state": "input-required",
      "message": {
        "role": "agent",
        "parts": [{ "kind": "text", "text": "Which dates?" }],
        "taskId": "TASK_ID",
        "contextId": "CTX"
      }
    },
    "kind": "task"
  }
}
```

You answer:

```json
{
  "method": "message/send",
  "params": {
    "message": {
      "role": "user",
      "parts": [{ "kind": "text", "text": "Oct 10–17" }],
      "taskId": "TASK_ID",
      "contextId": "CTX"
    },
    "configuration": { "blocking": true }
  }
}
```

###### Streaming (SSE via `message/stream`)

**How you receive the request for input**

1. You call `message/stream`. The HTTP response is an SSE stream of JSON‑RPC responses.
2. The first event is usually the Task. Subsequent events are either `status-update` or `artifact-update`.
3. When the agent needs input, you receive a `status-update` whose `status.state` is `input-required` (often with the clarifying question in `status.message`). Because `input-required` is an “interrupted” state, the server marks the event `final: true` and closes the SSE stream.

**How you respond**

- Open a new send that references the same task:
  - If you want another streamed continuation, call `message/stream` again with the same `taskId` (and `contextId`).
  - If you’re fine with a simple response/polling, call `message/send` instead.
- If your previous stream dropped mid‑flight (not yet at an interrupted/terminal state), you can also use `tasks/resubscribe` to resume; but once the task is `input-required`, you must send a new message to continue.

**Event shapes you’ll see (streaming)**

Typical status update during the stream:

```json
{
  "result": {
    "kind": "status-update",
    "taskId": "TASK_ID",
    "contextId": "CTX",
    "status": {
      "state": "input-required",
      "message": {
        "role": "agent",
        "parts": [{ "kind": "text", "text": "Origin and destination?" }]
      }
    },
    "final": true
  }
}
```

(When this event arrives, the stream ends; now you send a new message with `taskId` to proceed.)

###### What’s common between streaming and non‑streaming

- The request for more info is represented as `Task.status.state = "input-required"` with the agent’s prompt in `Task.status.message`.
- Your reply is always another `message/send` (or `message/stream`) with the same `taskId` (and `contextId`) carrying the user’s answer.
- You can swap between polling (`tasks/get`), webhooks (push notifications), and streaming as needed—these are delivery channels for state changes, not different task models.

###### Extra context (why Tasks vs Messages matters)

Google’s guidance is to use Messages for quick chit‑chat and Tasks for goal‑oriented, multi‑turn or long‑running work; `input-required` is exactly where a Task pauses to disambiguate and keep context clean per goal.

---

#### User (message 2)

- What if I need to enforce a specific data schema for the client to respond with instead of a free‑form text message?

#### Assistant (reply 2)

##### Enforcing a structured client reply (schema‑shaped input)

**Short answer**: treat the `input-required` pause as a contract negotiation for structured input. In A2A today you enforce a schema by (a) asking for a `DataPart` with a declared media type/schema in the agent’s input request, and (b) validating the client’s reply server‑side. If it doesn’t match, keep the task in `input-required` (or return a JSON‑RPC error) with machine‑readable validation errors. This works the same for streaming and non‑streaming—the only difference is delivery (SSE ends when the pause happens).

###### 1) How the server asks for structured input

When your task moves to `input-required`, include a schema hint and media type in the message parts. The spec’s “Structured Data Exchange” section shows using `Part.metadata` to carry `mimeType` and a JSON Schema (schema negotiation isn’t formally standardized yet, but this is the recommended convention in v0.2.x).

Agent → client (task paused, asks for JSON‑shaped input):

```json
{
  "result": {
    "id": "TASK_ID",
    "contextId": "CTX",
    "status": {
      "state": "input-required",
      "message": {
        "role": "agent",
        "parts": [
          {
            "kind": "text",
            "text": "Please provide traveler details as JSON.",
            "metadata": {
              "mimeType": "application/json",
              "schema": {
                "type": "object",
                "required": ["firstName", "lastName", "dob"],
                "properties": {
                  "firstName": { "type": "string" },
                  "lastName": { "type": "string" },
                  "dob": { "type": "string", "format": "date" },
                  "seat": { "type": "string", "enum": ["aisle", "window", "middle"] }
                },
                "additionalProperties": false
              }
            }
          }
        ],
        "taskId": "TASK_ID",
        "contextId": "CTX"
      }
    },
    "kind": "task"
  }
}
```

**Why this shape?**

- `DataPart` is the official vehicle for structured JSON; schema hints can live in `metadata` (v0.2.x guidance).
- The spec documents this pattern and notes schema negotiation isn’t formal yet—use conventions.

Tip: If the schema is large, attach it as a `FilePart` (e.g., `application/schema+json`) or host it and reference by URL; you still describe the requirement in the message. (Media types and `FilePart` are first‑class in A2A.)

###### 2) How the client should reply

The client answers the same task with a `DataPart` that matches your schema—no free‑form text needed.

Client → server (structured reply):

```json
{
  "method": "message/send",
  "params": {
    "message": {
      "role": "user",
      "parts": [
        {
          "kind": "data",
          "data": {
            "firstName": "Ava",
            "lastName": "Nguyen",
            "dob": "1994-10-12",
            "seat": "aisle"
          },
          "metadata": {
            "mimeType": "application/json"
          }
        }
      ],
      "taskId": "TASK_ID",
      "contextId": "CTX"
    }
  },
  "id": "req-continue"
}
```

###### 3) Enforcement and error handling (server side)

- If the media type is wrong (e.g., text instead of JSON), respond with a JSON‑RPC error using the A2A custom code `ContentTypeNotSupportedError` (`-32005`).
- If the shape/content is invalid, you have two reasonable options:
  1. Return a JSON‑RPC error (e.g., `-32602` Invalid params) describing the violations in `error.data`.
  2. Keep the task in `input-required` and return another status/message that includes machine‑readable validation errors (then the client fixes and resubmits).

Both patterns are allowed by the spec; choose based on your client UX.

###### 4) Streaming vs non‑streaming

- Streaming (`message/stream`): You’ll receive a `status-update` where `status.state = input-required`. The server marks the event `final: true` and closes the SSE stream. To continue, the client opens a new `message/stream` (or `message/send`) with the same `taskId` and the `DataPart` payload.
- Non‑streaming: You see the Task with `state: "input-required"` via the immediate response, polling (`tasks/get`), or your push webhook. You answer with `message/send` containing the `DataPart`. (Same task ID.)

Key point: The enforcement mechanism is identical in both modes—the only difference is how you receive the “please send JSON shaped like X” request and how you deliver your next turn. The schema contract and validation are transport‑agnostic.

###### 5) Optional niceties (today and near‑future)

- Embed a mini “form spec”: Some teams add a list of required “fields” (names, kinds: text/file/data, enums) in a `DataPart` alongside the human text. This is not yet standardized, but it’s a practical convention and there’s an open issue to formalize “structured field definitions” for inputs.
- Server guidance docs: If your server publishes a strict input schema, link it from your Agent Card or send it as a `FilePart`. The spec encourages discovery and media‑type negotiation patterns.

###### TL;DR recipe

1. Server (on pause): ask for `DataPart` with `metadata.mimeType` and a JSON Schema hint.
2. Client (reply): send `DataPart` that conforms.
3. Server (enforce): validate; if wrong, either JSON‑RPC error (`-32602` / `-32005`) or remain in `input-required` with machine‑readable errors.
4. Streaming vs non‑streaming: identical contract; streaming just ends the SSE when the pause happens.

If you want, I can sketch a tiny validator stub (pseudo or TypeScript) that shows returning input‑required with field‑level errors vs a JSON‑RPC error.

---

## References

- A2A Spec v0.2.x — `DataPart`, media types, task states, streaming behavior, error codes; “Structured Data Exchange” example with schema hints in metadata.
- Google Dev forum write‑up: [Demystifying Tasks vs Messages](https://discuss.google.dev/t/a2a-protocol-demystifying-tasks-vs-messages/255879)
