# PRD: LangGraphAgent Connect Support and Runtime Connect Behavior

## Overview
- Enable first-class `connect` behavior for LangGraphAgent within CopilotKit runtime.
- Ensure thread state snapshots hydrate UI immediately and stream events resume correctly.
- Stabilize runtime connect flows across reconnects, active runs, and error states.

## Background/Problem
- Runtime `agent/connect` previously replayed only stored runs and did not call `LangGraphAgent.connect`.
- Thread state snapshots were missing, causing UI metrics to remain at default values.
- Schema filtering dropped state fields when LangGraph assistant schemas lacked input/output.
- Runtime fetch failures and dev server watch limits obscured validation; production mode confirmed expected stream events.

## Goals
- Populate UI metrics from LangGraph thread state on initial connect.
- Support resumable streams using `Last-Event-ID` without duplicating events.
- Allow attaching to active runs and receiving live events.
- Surface connection errors clearly as runtime events.

## Non-goals
- Support for cron-driven runs emitting live stream events.
- Automatic cancellation of running jobs on client disconnect.
- Changes to external API contracts or LangGraph backend behavior.

## Business Requirements
- Users see accurate dashboard metrics immediately after connecting.
- Operators can rely on connect for consistent state hydration and stream recovery.
- Runtime reports clear errors when a thread is invalid or unreachable.

## User Stories
- As a user, I see my dashboard metrics update immediately after connecting.
- As a user, I can refresh the page and resume from the last event without duplicates.
- As a developer, I can debug connection issues with explicit runtime error events.
- As an operator, I can safely connect to an idle thread without affecting other runs.

## Functional Requirements
- On connect, runtime calls `agent.connect` when available and streams the resulting events.
- Connect emits `RUN_STARTED`, `STATE_SNAPSHOT`, `MESSAGES_SNAPSHOT`, `RUN_FINISHED` on initial snapshot.
- Resumable connect honors `Last-Event-ID` and resumes from the next event ID.
- Connect attaches to pending/running runs and emits `RAW_EVENT` and live events.
- Invalid thread IDs emit `RUN_ERROR` with upstream error details.
- Disconnect does not cancel running jobs; run completion events continue server-side.
- Schema filtering is bypassed or relaxed when assistant schemas omit input/output.

## Non-functional Requirements
- Connect latency: initial snapshot visible within 5 seconds for local runtime.
- Event ordering preserved within a thread stream.
- No cross-thread event leakage in multi-thread scenarios.
- Runtime connect is robust to temporary network errors and resumes on reconnect.

## UX/Interaction Expectations
- UI shows metrics from thread state immediately after connect.
- Connection status reflects Connected once runtime handshake completes.
- Errors surface as user-visible alerts/log entries derived from `RUN_ERROR`.
- Reconnect does not reset visible metrics unless state changed.

## Technical Requirements
- Runtime connect handler must support `agent.connect` when available.
- `Last-Event-ID` must be supported for resumable streams.
- AG-UI event stream includes standardized event types and IDs.
- Schema handling must avoid dropping state fields when assistant schemas are incomplete.
- Client triggers a post-connect `sync` to align state after handshake.

## Integration Points
- CopilotKit runtime `agent/connect` endpoint.
- `LangGraphAgent` connect API and thread state endpoint.
- Web client `useAgentConnection` hook for connect lifecycle.
- AG-UI event pipeline and inspector.

## Constraints and Considerations
- LangGraph assistant schemas may return only config/context schemas.
- Cron-driven runs (for example, scheduler jobs) do not create API run streams.
- Dev server file watcher limits may cause local 404s; use production mode for validation.

## Architectural Decisions (Approval Required)
- Decision: Runtime connect handler will invoke `agent.connect` when available and stream snapshot events.
- Decision: Relax schema-based filtering when assistant schemas omit input/output.
- Decision: Client initiates explicit `sync` after runtime reports Connected.
- Decision: Disconnect does not cancel running runs.

## Metrics and Success Criteria
- Initial connect populates metrics (7D income, APY, users, AUM, points) within 5 seconds.
- Reconnect with `Last-Event-ID` resumes with next event ID and no duplicates.
- Active run attach delivers live events within 2 seconds of connect.
- Invalid thread ID yields `RUN_ERROR` within 2 seconds with HTTP status preserved.
- No cross-thread event leakage observed in multi-thread tests.

## Risks
- Assistant schemas evolving could reintroduce schema filtering issues.
- Missing run streams for cron jobs could be misinterpreted as failures.
- Runtime behavior divergence between dev and production modes.

## Dependencies
- LangGraph SDK `connect` support and thread state endpoint.
- CopilotKit runtime event streaming infrastructure.
- Web client connection lifecycle (`useAgentConnection`).

## Rollout/Release Plan
- Ship patched runtime and agent packages behind standard deployment.
- Validate in production-mode environment with a known thread.
- Monitor metrics hydration and event stream stability.
- Roll back by reverting runtime connect handler changes if regressions.

## Test Plan
- Manual connect flow: confirm snapshot events and metrics hydration.
- Reconnect flow: validate `Last-Event-ID` resume correctness.
- Active run attach: verify live `RAW_EVENT` delivery.
- Error case: invalid thread ID produces `RUN_ERROR`.
- Thread isolation: ensure events remain scoped to thread.

## Out of Scope
- Changes to LangGraph backend or scheduler behavior.
- Implementing new UI components beyond existing metrics display.
- Streaming support for cron-triggered runs.

## Open Questions
- Should cron-driven runs eventually emit streamable events?
- Desired timeout threshold for connect before surfacing errors?
- Should `sync` be optional or configurable per client?
