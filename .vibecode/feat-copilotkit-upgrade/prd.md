# LangGraphAgent Connect Support
PRD Version: 2026-01-24
Status: Draft

## Overview

Enable CopilotKit LangGraph agents to support a persistent connect stream so the UI can receive real-time updates for background and cron-driven runs that do not have a frontend-provided run ID.

## Business Requirements

- Provide a first-class connect experience for LangGraph-based agents so clients can observe long-running or scheduled activity without polling.
- Support deterministic thread-level updates so state stays in sync across sessions and devices.
- Keep the changes maintainable and upstreamable by applying them as a pnpm patch to the LangGraphAgent package.

## Success Criteria

- Phase 1: When a client connects with a thread ID, the stream delivers an initial snapshot and completes with a valid run boundary.
- Phase 2: When a run is active, connect attaches to the live run stream and delivers incremental updates until completion.
- Connect works without requiring a run ID and does not break existing run-based streaming flows.
- The stream shuts down cleanly when the client disconnects or the server shuts down.
- Errors are surfaced to clients in a consistent, actionable way.

## Technical Requirements

- Implement connect support directly in LangGraphAgent via a pnpm patch in this repo.
- Phase 1: Use LangGraph SDK thread APIs to source initial state snapshots.
- Phase 2: Attach to active run streams for incremental updates when available.
- Emit AG-UI compliant events for initial state and incremental updates.
- Maintain full TypeScript strictness (no any) and follow existing schema validation conventions.

## Integration Points

- CopilotKit runtime connect endpoint and client connect logic.
- LangGraph SDK thread state and thread streaming APIs.
- Web AG-UI client that uses a deterministic thread ID.

## Implementation Evidence

Local LangGraph API endpoints (langgraph-api 1.1.11) available for connect support:

- Meta: `GET /ok`, `GET /info`
- Assistants: `POST /assistants`, `POST /assistants/search`, `POST /assistants/count`, `GET /assistants/:assistant_id`, `PATCH /assistants/:assistant_id`, `DELETE /assistants/:assistant_id`, `GET /assistants/:assistant_id/graph`, `GET /assistants/:assistant_id/schemas`, `GET /assistants/:assistant_id/subgraphs/:namespace?`, `POST /assistants/:assistant_id/latest`, `POST /assistants/:assistant_id/versions`
- Threads: `POST /threads`, `POST /threads/search`, `POST /threads/count`, `GET /threads/:thread_id`, `PATCH /threads/:thread_id`, `DELETE /threads/:thread_id`, `POST /threads/:thread_id/copy`, `GET /threads/:thread_id/state`, `POST /threads/:thread_id/state`, `GET /threads/:thread_id/state/:checkpoint_id`, `POST /threads/:thread_id/state/checkpoint`, `GET /threads/:thread_id/history`, `POST /threads/:thread_id/history`
- Runs: `POST /runs`, `POST /runs/stream`, `POST /runs/wait`, `POST /runs/batch`, `GET /runs/:run_id/stream`, `GET /threads/:thread_id/runs`, `POST /threads/:thread_id/runs`, `POST /threads/:thread_id/runs/stream`, `POST /threads/:thread_id/runs/wait`, `GET /threads/:thread_id/runs/:run_id`, `DELETE /threads/:thread_id/runs/:run_id`, `GET /threads/:thread_id/runs/:run_id/join`, `GET /threads/:thread_id/runs/:run_id/stream`, `POST /threads/:thread_id/runs/:run_id/cancel`
- Store: `POST /store/namespaces`, `POST /store/items/search`, `PUT /store/items`, `DELETE /store/items`, `GET /store/items`
- Internal: `POST /internal/truncate`
- Crons declared but return 500: `POST /runs/crons`, `POST /runs/crons/search`, `DELETE /runs/crons/:cron_id`, `POST /threads/:thread_id/runs/crons`

No `/threads/:thread_id/stream` endpoint is implemented in the local API.

LangGraph SDK stream metadata findings:

- Run stream events include a metadata event with `run_id` and `thread_id` (`MetadataStreamEvent`), and `events` stream data includes `run_id`.
- Thread join stream exists in the SDK with `streamMode` values `run_modes`, `lifecycle`, `state_update`, plus `lastEventId` support, but its payload is typed as `any` and does not guarantee run metadata in the type system.

Local API stream test findings (agent-clmm):

- `POST /threads/:thread_id/runs/stream` emits an initial `metadata` SSE event containing `run_id` and `attempt`.
- Subsequent `events` payloads include `run_id` at the event root, and `metadata` includes both `run_id` (root run) and `thread_id`.
- Node-level events (`on_chain_start`/`on_chain_end`) have distinct run ids for each node, while `metadata.run_id` continues to reference the root run.
- `stream_mode: ["events","values","messages"]` yields `events`, `values`, and `messages/complete` SSE event types.
- The run stream closes without a dedicated SSE "finished" marker; completion is inferred from stream termination or the final `on_chain_end` for the root run.
- `GET /threads/:thread_id/runs/:run_id/stream` with `Last-Event-ID` after a non-resumable run produced no replayed events.
- Setting `stream_resumable: true` on run creation allows replay via `Last-Event-ID`; rejoining with `Last-Event-ID: 0` returned the full event stream (starting at id 1, without the initial `metadata` event).
- Replaying with a mid-stream `Last-Event-ID` (example: `8`) resumes at the next event id (`9`) and does not include the initial `metadata` event.
- Attempts to hold a run using `interrupt_before: "*"` or `interrupt_before: ["runCommand"]` still completed quickly and reported `status: success`.
- Scheduling a delayed run with `after_seconds` keeps run status in `pending`; the thread reports `status: busy` while pending and returns to `status: idle` after the run completes.

Cron execution behavior (agent-clmm):

- Cron scheduling is handled in-process via `node-cron` (`src/workflow/cronScheduler.ts`) and is triggered by `pollCycle` once a thread completes its first cycle.
- Cron ticks call `runGraphOnce`, which executes `clmmGraph.updateState(...)` and `clmmGraph.invoke(...)` directly in the same process; it does not call the LangGraph API `runs/stream` endpoints.
- `runGraphOnce` explicitly sets `callbacks: []` to avoid using the SSE callback handler; this prevents streaming events from being emitted during cron runs.
- The cron worker uses `thread_id` in the runnable config but does not set `run_id` or `stream_resumable`.
- Implication: cron-driven runs update thread state (visible via `/threads/:thread_id/state`) but do not expose a run stream that `connect()` can attach to unless cron execution is refactored to use API run creation or to emit events to the connect stream.
- Cron updates rely on the graph checkpointer (`memory = createCheckpointer()` in `src/workflow/context.ts`) because cron uses `clmmGraph.updateState(...)` and `clmmGraph.invoke(...)` directly with `configurable.thread_id`.
- Snapshots via `/threads/:thread_id/state` reflect cron updates only when cron runs inside the same LangGraph API process; a separate cron process with an in-memory checkpointer will not share state with the API server.

Endpoints LangGraphAgent relies on today (via the SDK):

- Assistants: `/assistants/search`, `/assistants/:assistant_id`, `/assistants/:assistant_id/schemas`, `/assistants/:assistant_id/graph`.
- Threads: `/threads`, `/threads/:thread_id`, `/threads/:thread_id/state`, `/threads/:thread_id/state/checkpoint`, `/threads/:thread_id/state/:checkpoint_id`, `/threads/:thread_id/history`.
- Runs: `/threads/:thread_id/runs/stream` (streamed execution), `/runs/stream` for stateless runs, and `/threads/:thread_id/runs/:run_id/cancel` for run cancellation.

Concrete SDK method usage in LangGraphAgent (from embedded source):

- `assistants.search`, `assistants.getSchemas`, `assistants.getGraph`
- `threads.create`, `threads.get`, `threads.getState`, `threads.updateState`, `threads.getHistory`
- `runs.stream`, `runs.cancel`

Connect-relevant implications:

- Thread-level connect must be built using existing thread state + run stream endpoints (snapshot + joins), because the local API does not provide a thread stream endpoint.
- Run streams can provide definitive run boundaries using metadata events; thread join streams require further validation of event shape.
- Candidate connect flow for local API: fetch `/threads/:thread_id/state` for snapshot, call `/threads/:thread_id/runs` to discover in-flight runs, then join each with `/threads/:thread_id/runs/:run_id/stream` and optionally poll history/state between runs.

AG-UI semantics and connect expectations (from docs research):

- `connect()` is defined as a persistent event stream transport, not necessarily an infinite lifetime; the stream can close after delivering events.
- `connectAgent()` is positioned as a drop-in alternative to `runAgent()` and returns a `Promise<RunAgentResult>`, which implies a run lifecycle with `RUN_STARTED` and `RUN_FINISHED`/`RUN_ERROR` boundaries.
- AG-UI supports multiple runs over a single stream (each with its own run boundaries), but the protocol also exposes `subscribe()` for multi-run observation.
- For run-like semantics, `connect()` should attach to a run (or emit a minimal run around snapshot delivery) and close when the run ends.
- Long-lived, multi-run observation should likely map to a separate watch/subscription surface, not `connectAgent()`.

Additional AG-UI event and serialization details (docs):

- `RUN_STARTED` + `RUN_FINISHED`/`RUN_ERROR` are mandatory run boundaries; step events are optional but recommended for progress tracking.
- `RUN_STARTED` supports optional `parentRunId` and `input` fields to track lineage/time travel and precise agent inputs.
- `STATE_SNAPSHOT` should replace the client’s state; `STATE_DELTA` is RFC 6902 JSON Patch; `MESSAGES_SNAPSHOT` provides full conversation history.
- Text and tool call events can be emitted as chunk events (`TEXT_MESSAGE_CHUNK`, `TOOL_CALL_CHUNK`) and expanded by the client into start/content/end sequences.
- Activity events (`ACTIVITY_SNAPSHOT`, `ACTIVITY_DELTA`) mirror the snapshot/delta pattern for structured in-progress activity messages.
- Event streams should be processed in order, but implementations should be resilient to out-of-order delivery.
- Serialization guidance: streams are append-only; compaction can merge deltas into snapshots and collapse message/tool streams; parentRunId enables branching.

AG-UI SDK client behavior notes:

- `AbstractAgent.connectAgent()` calls `connect()` internally; default `connect()` throws `ConnectNotImplementedError` unless overridden by the agent or framework.
- `subscribe()` is explicitly for subscribers across multiple runs, reinforcing the multi-run observation path.
- `events$` is a `ReplaySubject`, so late subscribers receive historical events automatically.
- `RunAgentParameters` include optional `runId`, `tools`, `context`, and `forwardedProps`.
- `HttpAgent` uses SSE by default (`Accept: text/event-stream`) with JSON-encoded `RunAgentInput` in the request body.

## Proposed Connect Contract (Aligned with AG-UI Architecture)

Based on the AG-UI architecture and run lifecycle expectations, the following connect behavior is aligned with protocol semantics:

- On `connect(input)`, rehydrate first: emit `RUN_STARTED` followed by `STATE_SNAPSHOT` (and `MESSAGES_SNAPSHOT` when available).
- If there is an active run, attach to that run’s stream, forward events, and close the stream after `RUN_FINISHED` or `RUN_ERROR`.
- If there is no active run, emit snapshots, then emit `RUN_FINISHED` and close the stream.
- Ensure the `RUN_STARTED` event includes a run id: use the server run id when attaching, or generate a synthetic run id for snapshot-only runs.

## Delivery Phases

Phase 1: Snapshot-only connect

- Implement `connect()` to emit `RUN_STARTED` → `STATE_SNAPSHOT` (and `MESSAGES_SNAPSHOT` if present) → `RUN_FINISHED`.
- This phase should work purely from `/threads/:thread_id/state` and does not require active run streaming.
- Intended to support cron-driven updates that only write to thread state.

Phase 2: Active run attachment

- Extend `connect()` to detect an active run (`pending`/`running`) and attach to `/threads/:thread_id/runs/:run_id/stream`.
- Forward stream events via the existing LangGraphAgent translation pipeline.
- Complete when the run stream ends or emits a finish/error event.
- May require cron refactor to create runs through the LangGraph API so runs are streamable.

## Handoff Checklist

Phase 1 completion gate:

- Implement `connect()` in `LangGraphAgent` (pnpm patch) to emit `RUN_STARTED` → snapshots → `RUN_FINISHED`.
- Snapshot source: `client.threads.getState(threadId)`; map `values` to `STATE_SNAPSHOT` and `values.messages` to `MESSAGES_SNAPSHOT`.
- Ensure no reliance on LangGraph `metadata` SSE events; always emit run boundaries locally.
- Validate snapshots against a thread updated by cron (same process) and against a thread with no active run.

Phase 2 completion gate:

- Add active run detection via `client.runs.list({ threadId })` (prefer `pending`/`running`).
- Attach to active run with `client.runs.joinStream` and pipe through `handleStreamEvents`.
- Emit `RUN_FINISHED`/`RUN_ERROR` when the run stream ends or fails.
- Confirm resumable replay with `Last-Event-ID` on a `stream_resumable` run (metadata event is not replayed).

Open integration checks for Phase 2:

- Confirm how `Last-Event-ID` is surfaced to `connect()` (header vs input field) in the CopilotKit runtime.
- Decide whether cron should be refactored to create API runs so `connect()` can attach to cron-driven activity.

## Implementation Outline (Handoff-Ready)

Target implementation location:

- Patch `@ag-ui/langgraph` via pnpm patch tooling; update the `LangGraphAgent` class in the package to implement `connect()`.

Recommended connect algorithm (phase-aware):

- Input handling: accept `threadId` from `input.threadId` (or `input.config.configurable.thread_id` if following LangGraph run config patterns). If missing, raise an error compatible with AG-UI (`RUN_ERROR` + close).
- Phase 1: skip active run detection; always emit snapshots and finish.
- Phase 2: call `client.runs.list({ threadId })` (maps to `GET /threads/:thread_id/runs`) and choose the most recent run with status `pending` or `running` (optionally `interrupted` if you want to surface paused runs). If none, treat as snapshot-only run.
- Emit AG-UI `RUN_STARTED` immediately (always emit locally; do not depend on the LangGraph `metadata` SSE event because it is not replayed on reconnect). Use the active run id when attaching, otherwise generate a synthetic run id (UUID).
- Rehydrate: call `client.threads.getState(threadId)` and emit:
  - `STATE_SNAPSHOT` with the state payload from `values` (LangGraph state)
  - `MESSAGES_SNAPSHOT` if `values.messages` exists (convert to AG-UI message shape if needed)
- Phase 2: If an active run exists, attach to it with `client.runs.joinStream(threadId, runId, { streamMode, lastEventId })` and forward events through the existing `handleStreamEvents` + `dispatchEvent` pipeline.
- Phase 1 or fallback: If no active run exists, emit `RUN_FINISHED` and close the stream after snapshots.
- Termination: when the run stream ends without an explicit finish event, emit `RUN_FINISHED` for the active run; emit `RUN_ERROR` on stream failure.

Event mapping expectations:

- `events` stream data already includes `run_id` and `metadata.thread_id`; treat the root run id as the AG-UI run id for the connect session.
- LangGraph node-level events have their own `run_id`; keep using existing LangGraphAgent mapping logic to translate them into AG-UI events.

Reconnect strategy details:

- LangGraph SSE event ids start with `id: 0` for `metadata`, then `id: 1..n` for stream events. Replays omit the initial metadata event.
- Support `Last-Event-ID` by passing it through to `joinStream` when provided by the client. Always emit `RUN_STARTED` locally so reconnects are consistent.
- Replay only works for runs created with `stream_resumable: true`; otherwise no events are replayed.

Active run detection hints:

- `GET /threads/:thread_id` reports `status: busy` while a delayed run is pending, and returns to `idle` after completion.
- `runs.list` returns run status values (`pending`, `running`, `success`, `error`, `timeout`, `interrupted`). Prefer `pending`/`running` as active.

Testing expectations (manual):

- Connect to a thread with a completed run: expect `RUN_STARTED` → snapshot(s) → `RUN_FINISHED`.
- Connect to a thread with a pending run: expect `RUN_STARTED` → snapshot(s) → streamed events → `RUN_FINISHED`.
- Reconnect to a resumable run with `Last-Event-ID` and confirm replay resumes after the provided event id (no metadata event replay).

## Constraints & Considerations

- Changes must be applied through pnpm patch tooling, not by forking the dependency.
- No backwards-compatibility shims or legacy aliases; update call sites if required.
- Avoid introducing new environment variables or runtime configuration unless strictly required.

## Architectural Decisions

- Decide whether the connect stream should be thread-based only or support optional run boundaries derived from thread events. This decision requires user approval before documenting in rationales.md.

## Out of Scope

- UI redesigns or changes to web client layout.
- Modifying cron scheduling behavior or adding new cron triggers.
- Adding new server endpoints beyond connect support already defined by CopilotKit.

## Open Questions

- Does the LangGraph thread stream include run metadata (run_id or equivalent) for deriving run boundaries?
- If run metadata is missing, what event types or heuristics define run boundaries (lifecycle events, message start/end, inactivity windows)?
- Is it acceptable to emit AG-UI events without run boundaries, or must we infer them to keep CopilotKit state tracking accurate?
- Can run boundaries be obtained from LangGraph APIs (threads.getHistory, runs.list) alongside the thread stream?
- How should reconnects behave: resume with lastEventId if available, or always emit snapshots first?
- Should translation from LangGraph stream to AG-UI events live entirely in the backend runtime?
- What level of fidelity is required (token-level message streaming vs periodic state snapshots)?
- Do we need to support concurrent runs interleaved in a single thread stream?
- Are there existing tests that must be extended to cover connect streaming for LangGraph agents?
