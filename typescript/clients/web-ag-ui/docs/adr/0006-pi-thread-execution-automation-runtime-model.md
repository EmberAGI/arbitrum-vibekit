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
- The root thread receives projected summaries, visible status updates, and artifacts by default.
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
