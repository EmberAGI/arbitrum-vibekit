# ADR 0006: pi-thread-execution-automation-runtime-model

Status: Accepted
Date: 2026-03-17

## Context

The current shared architecture and tests need stronger boundaries for persistence, structured interrupts, background autonomy, and replay safety. A single undifferentiated "thread" concept is not sufficient for the Pi-backed agent because:
- user-facing chat state and setup state must remain stable and durable
- interactive turns and automation-triggered/background executions have different lifecycle and retry needs
- recurring/scheduled automation definitions are not the same thing as one execution attempt
- risky side effects such as transaction broadcast require replay-safe coordination

This runtime model also needs to be explicit about what comes from today's `pi-mono` packages versus what this initiative is adding:
- `@mariozechner/pi-agent-core` already provides the stateful agent loop, prompt/continue semantics, tool execution, event streaming, and turn/message lifecycle.
- `@mariozechner/pi-ai` already provides the model/provider/tool-calling substrate under that loop.
- `PiThread`, `PiExecution`, `PiAutomation`, and `AutomationRun` are initiative-level runtime records layered around that Pi core so `web-ag-ui` can support durable threads, automations, projections, and operator/runtime controls.
- These records are not claimed to be existing first-class primitives in `pi-mono` today.

We also want eventual A2A support, but full A2A adoption is not in scope for this initiative. The runtime still needs an execution model that can align with A2A semantics later, and `web-ag-ui` already treats `task` as the lifecycle/status projection of active work. The architecture therefore needs a clear distinction between canonical domain records and protocol/UI projections.

## Decision

Adopt a four-part Pi runtime model:
- `PiThread`
  - the root user-facing durable conversation container
  - owns chat history, pending structured interrupts, visible artifacts, and root metadata
  - provides the user-facing container that agent domain modules project lifecycle/domain state into
- `PiExecution`
  - the canonical execution-loop record for any agent work
  - used for direct user/chat-triggered execution and automation-triggered execution alike
  - owns execution lifecycle state, streamed artifacts/events, interrupts, and dedupe/outbox references
- `PiAutomation`
  - the saved recurring/triggered automation definition
  - owns cadence/policy and scheduler state
- `AutomationRun`
  - the audit/provenance record for one automation firing
  - usually creates or references one `PiExecution`

These runtime records sit above the concrete Pi package foundation:
- `@mariozechner/pi-agent-core` remains the owner of the in-turn agent loop, message flow, tool execution, and emitted event stream.
- This initiative adds durable runtime records, persistence, automation, projection, and operator/runtime layers around that core.

The foundational runtime model is intentionally lower-level than any specific agent-family lifecycle system.
- Opinionated workflows such as hire/setup/refresh/fire do not belong in the core runtime model itself.
- Those higher-level workflows belong in pluggable Pi-owned agent domain modules layered above the core runtime model, as described in ADR 0011.

Additional rules:
- Background/autonomous executions run in separate operational contexts linked back to the root thread.
- Scheduled automation executions use ephemeral in-memory agent execution context for the saved instruction.
- That scheduled-run context must not be persisted as a durable `PiThread` or exposed as a primary user-visible chat thread by default.
- Generic session persistence must detect the scheduled-run context and skip `pi_threads` writes for `automation:<automationId>:run:<runId>` prompt contexts; it checkpoints the `PiExecution` against the root `PiThread` record and persists a bounded run snapshot as an execution-scoped `automation-run-snapshot` artifact/event.
- The durable scheduled-run contract is `AutomationRun` + `PiExecution` + execution/activity events, bounded transcript snapshots, summaries, artifacts, failure/timeout detail, outbox/dedupe references, and root-thread projections.
- Starting a scheduled run is a conditional `scheduled -> running` claim committed in the same Postgres transaction as the running event/activity writes. If another runtime process has already claimed the row, the scheduler must roll back and skip invocation rather than invoking the agent twice.
- The first `AutomationRun.scheduled_at` created by `automation.schedule` and every replacement scheduled run must store the due cadence timestamp that matches `PiAutomation.next_run_at`, not the creation, tick-start, or terminal timestamp.
- Scheduler execution is guarded per automation, not by one global invocation lock. The same automation must not overlap with itself, but a long-running or timed-out invocation for one automation must not starve unrelated due automations.
- Completion, failure, timeout, and cancellation transitions are also conditional terminal claims. They must only update the expected active/scheduled row, require one affected row, and abort the remaining transaction so stale writers cannot overwrite a competing terminal state or insert another future run.
- A stale-active timeout that loses its row-count terminal race must be handled as a lost race, skipped, and not allowed to abort processing of later due automations in the same scheduler tick.
- A same-process scheduled invocation must be bounded by the automation timeout. If the agent stream hangs after the claim commits, the scheduler aborts the active runtime run, marks the `AutomationRun` timed out, schedules the next run on cadence, and suppresses late snapshot persistence from that timed-out run.
- Completion, failure, and timeout persistence must use the terminal-decision time, not the tick-start time, for completed timestamps, terminal event/activity timestamps, lease expiry, replacement run/execution ids, and next-run cadence.
- Canceling automation must suspend cadence and cancel only the current scheduled or already-running run owned by the active root thread. The model-facing cancel path must scope persisted automation lookup, run lookup, row updates, execution updates, and scheduler-lease cleanup to the active root thread record; an automation id from another root thread is not sufficient authority. If the current run is active in the same process, cancellation must call the runtime stop path so terminal completion cannot continue to advance cadence. A canceled active run must not leave the linked `PiExecution` looking completed in inspection; the execution terminal state must reflect the unsuccessful cancellation boundary. If the automation definition has no current run/execution, cancellation still suspends the definition and may write root activity with a nullable execution id, but it must not insert a `pi_execution_events` row with a null execution id.
- Runtime-owned tools raised inside a scheduled run, including interrupt/outbox/signing-style boundaries, must persist against the scheduled automation `PiExecution` and root `PiThread`, not a synthetic run-thread record.
- Runtime inspection/control state must load artifact payloads and execution/activity payloads so persisted scheduled-run snapshots remain inspectable after restart.
- Model-facing automation listing must treat suspension as the canonical canceled signal before deriving completed state from `next_run_at = null`, because cancellation clears the next-run timestamp as part of suspending cadence.
- The root thread receives projected summaries, visible status updates, and run-snapshot artifacts by default. Persisted scheduled-run snapshots must be appended to live root activity before publishing terminal updates and rehydrated from Postgres on cold load.
- Web activity views must expose inspect/open affordances for projected `AutomationRun` ids and persisted run-snapshot artifacts through control-plane-backed navigation. Static identifier labels and local page anchors are not sufficient for run-detail inspection. Control-plane-backed run/artifact opens must carry active root-thread scope, and runtime control reads must filter by that scope before returning run or artifact candidates.
- Previous-run context included in the next scheduled prompt must be concise: prior run id/status/timestamp plus snapshot-derived result summary and run-detail/activity/artifact references, not a replay of the old transcript. Snapshot summaries and the injected `<previous_run_summary>` value must be compacted to a bounded single-line summary before they are persisted or reused.
- Raw internal execution/automation history is available only through explicit tools.
- The root thread must expose one stable current-state artifact, one append-only activity artifact/log, and optional execution-specific artifacts.
- The runtime must treat projection as a first-class subsystem rather than ad hoc adapter glue:
  - `PiExecution -> AG-UI thread.task`
  - `PiExecution -> A2A Task`
  - `PiExecution -> channel-visible execution summaries/artifacts`
- The projection subsystem must preserve one canonical execution identity while allowing multiple protocol- or channel-specific views.
- Use durability tier B:
  - durable thread state
  - durable automation definitions / queue state
  - no requirement for exact in-flight workflow checkpoint resume
- Risky side effects must use exactly-once-ish dedupe keyed by wallet/account + action fingerprint.
- Actionable `input-required` style interrupts raised by autonomous work must surface into the root thread.
- A2A `Task` and `web-ag-ui` `thread.task` are projections of `PiExecution`, not separate durable business entities.
- AG-UI `run` is a transport/control-plane action that starts or continues a `PiExecution`; it is not a durable domain record.
- The runtime must maintain an explicit identifier mapping contract:
  - `PiThread.id` is the canonical user-facing root-thread identity
  - `PiExecution.id` is the canonical execution identity
  - `PiAutomation.id` is the canonical saved automation identity
  - `AutomationRun.id` is the canonical automation-firing identity
  - AG-UI/A2A/channel ids may project from these records but must not create competing durable execution records

## Rationale

- Separating thread, execution, automation definition, and automation firing responsibilities creates testable boundaries for persistence and retries.
- Operational context separation keeps autonomous reasoning from polluting the user-visible chat thread.
- Keeping scheduled-run prompts ephemeral avoids user-visible thread clutter while preserving durable auditability through run and execution records.
- A stable root thread plus projected artifacts supports the chat-first UI while preserving rich background behavior.
- A formal projection subsystem reduces drift across AG-UI, A2A, and future channel adapters.
- Anchoring the model on `@mariozechner/pi-agent-core` + `@mariozechner/pi-ai` prevents the architecture from drifting into an imaginary Pi platform detached from the real `pi-mono` package seams.
- A2A-aligned task semantics preserve future protocol optionality without forcing immediate runtime adoption of `a2a-js`.
- Treating `Task` as a projection of `PiExecution` lets the same underlying execution map cleanly into A2A and `web-ag-ui` without creating a second competing task system.
- Tier B durability fits the current risk profile without prematurely building exact checkpoint resume machinery.

## Alternatives Considered

- Treat the root chat thread as the same thing as every execution and automation firing:
  - Rejected because it conflates durable user context with retryable execution state and creates transcript pollution.
- Use one shared execution lane for chat turns and background autonomy:
  - Rejected because it creates unnecessary contention and weakens replay/inspection boundaries.
- Persist every scheduled-run context as a normal durable `PiThread`:
  - Rejected because scheduled-run prompts are operational execution context, not user-facing conversation containers.
- Create a separate durable `Task` entity alongside `PiExecution` for the same execution:
  - Rejected because it would duplicate execution identity and create drift between domain state and A2A/UI projections.
- Require exact LangGraph-style in-flight checkpoint resume:
  - Rejected because it adds complexity beyond the currently agreed durability tier.
- Adopt `a2a-js` as the immediate runtime substrate:
  - Rejected because its task utilities are useful, but they do not provide the full Pi-owned thread/session/automation architecture required here.

## Consequences

- Positive:
- Clear persistence and concurrency boundaries.
- Better support for structured interrupts and replay-safe side effects.
- Cleaner mapping between runtime concepts and UI/protocol projections.
- Cleaner separation between reusable runtime execution concepts and agent-family-specific workflow semantics.
- Tradeoffs:
  - Adds explicit runtime model complexity and more state types to test.
  - Requires projection logic from execution/automation contexts back into the root thread.
- Follow-on work:
  - Define concrete schemas for `PiThread`, `PiExecution`, `PiAutomation`, `AutomationRun`, artifacts, and interrupt projection.
  - Define the projection-layer contracts and id-mapping rules from Pi records to AG-UI, A2A, and future channel views.
  - Define the pluggable agent-domain-module contract layered above the core runtime.
  - Define the automation inspection/control tool surface for chat turns.
  - Add persistence and recovery tests around automation firing, execution restart, interrupt resurfacing, and dedupe/outbox behavior.
