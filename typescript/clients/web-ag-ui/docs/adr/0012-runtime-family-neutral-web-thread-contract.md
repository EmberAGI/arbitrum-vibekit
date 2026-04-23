# ADR 0012: runtime-family-neutral-web-thread-contract

Status: Accepted
Date: 2026-03-30

## Context

ADR 0003 established `thread.lifecycle.phase` as the canonical render truth for the web UI.
ADR 0008 established that LangGraph and Pi-backed runtimes must share a runtime-agnostic contract layer.
ADR 0011 established that `agent-runtime` owns runtime and projection assembly rather than pushing that responsibility into React or downstream apps.

Recent portfolio-manager onboarding work exposed that this contract was still underspecified at the exact web-facing snapshot boundary:
- the web app was still carrying fallback logic for runtime-family differences
- `agent-runtime` connect snapshots could omit lifecycle when default session state had not yet been materialized
- `agent-runtime` projected `thread.task.taskStatus.message` as a raw string while LangGraph-backed agents project the message object shape used throughout existing web-agent state

That mismatch is dangerous because the web UI uses lifecycle and task status to decide hired state, active state, blockers, and onboarding rendering. If LangGraph agents and `agent-runtime` agents emit different shapes for those core fields, new agent work will keep reintroducing web regressions and runtime-specific branching.

## Decision

Adopt and enforce one runtime-family-neutral web-facing thread contract for LangGraph and `agent-runtime` agents.

The required shared contract is:
- every emitted thread snapshot used by the web must include `thread.id`
- every emitted thread snapshot used by the web must include `thread.lifecycle.phase`
- `thread.lifecycle.phase` must be emitted by the runtime as a concrete string value and must not be omitted or left `null` when a thread snapshot exists
- every emitted thread snapshot used by the web must include `thread.task.taskStatus.state`
- when `thread.task.taskStatus.message` is present, it must use the LangGraph-compatible object shape `{ content: string }`
- attach and hydration paths such as AG-UI `connect` must establish this shared thread contract with a concrete snapshot baseline before the web is expected to reconcile later deltas against it

Ownership rules:
- runtime families are responsible for adapting their internal execution state into the shared web-facing contract before the snapshot reaches the web
- the web app may keep temporary defensive normalization for older or already-persisted snapshots, but that normalization is compatibility fallback rather than a supported divergent contract
- runtime-specific extra metadata may still exist in artifacts, activity, or projection-specific fields, but core web state gating must rely only on the shared contract above

Enforcement rules:
- shared contract tests must live at the CopilotKit boundary in `apps/web/src/app/api/copilotkit`
- those tests must cover at least one LangGraph-backed reference agent and one `agent-runtime`-backed reference agent
- any change to the shared contract requires updating both runtime families and the shared contract tests in the same slice

## Rationale

- Keeps the web app runtime-family-neutral for the fields that drive layout and onboarding decisions.
- Places adaptation responsibility in the runtimes, which matches ADR 0011 and avoids leaking business or transport concerns into React.
- Reuses the existing LangGraph-shaped task status message object instead of inventing a second Pi dialect.
- Makes regressions visible where they matter most: the web-facing CopilotKit boundary that both runtime families must satisfy.

## Alternatives Considered

- Keep runtime-family-specific web branching for core state:
  - Rejected because it guarantees repeated regressions whenever a new Pi-backed agent or LangGraph cleanup lands.
- Let `agent-runtime` keep raw string task status messages and normalize them only in the web:
  - Rejected because it codifies two incompatible contracts and pushes runtime adaptation into the UI.
- Document the rule without executable contract tests:
  - Rejected because the failure mode here is subtle drift, not lack of prose.
- Create a second adapter layer inside the web app to canonicalize all runtime families:
  - Rejected because it duplicates runtime-owned projection work and conflicts with ADR 0011.

## Consequences

- Positive:
  - LangGraph and `agent-runtime` agents now have one explicit contract for the web fields that determine hired, onboarding, and active state.
  - Future runtime-family additions have a clear bar to satisfy before UI work is considered done.
  - Contract drift becomes a test failure instead of a manual debugging session.
- Tradeoffs:
  - Runtime packages must sometimes change their emitted shape even when the web could tolerate the older form.
  - Some existing tests and fixtures need cleanup when the canonical shared shape changes.
- Follow-on work:
  - Continue removing runtime-family-specific web branching where it only exists to compensate for old snapshot drift.
  - Keep shared CopilotKit contract tests current as new runtimes or agent families are introduced.
