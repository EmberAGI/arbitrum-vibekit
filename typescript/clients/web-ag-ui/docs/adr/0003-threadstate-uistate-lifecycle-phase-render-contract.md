# ADR 0003: threadstate-uistate-lifecycle-phase-render-contract

Status: Accepted
Date: 2026-02-28

## Context

The UI stability investigation found recurrent render oscillation (`pre-hire <-> metrics`) caused by mixed concerns:
- Command intent (`command`) persisted in shared state and used for render decisions.
- No canonical lifecycle phase field in agent-emitted state for render truth.
- Web state contracts and naming still centered on `view`/`AgentView`, blurring domain vs view-model boundaries.

The architecture direction in project docs calls for one-way MVVM/MVI-lite boundaries and explicit `ThreadState -> UiState -> View` layering.

## Decision

Adopt a canonical render contract with these rules:
- Agent/domain emits `ThreadState` as source-of-truth workflow state.
- `ThreadState` includes `thread.lifecycle.phase` with canonical values:
  - `prehire | onboarding | active | firing | inactive`
- Web derives `UiState` from AG-UI payloads + local transient UI lanes.
- React views consume only `UiState`.
- Command intent is control-plane input only and must not be persisted as render-driving shared state in `ThreadState` or `UiState`.
- Layout/hired-state gating must derive from lifecycle phase (and task lifecycle where needed), not persisted command values.

## Rationale

- A canonical lifecycle phase provides monotonic, durable render truth and removes ambiguity from sparse/out-of-order snapshots.
- Separating control intent from render state reduces oscillation and state-coupling regressions.
- Explicit domain/view-model naming reduces boundary drift and clarifies where invariants belong.

## Alternatives Considered

- Keep using persisted `command` as a rendering fallback:
  - Rejected because command is transport intent and can be stale, causing layout regression.
- Keep current naming (`view`/`AgentView`) and rely on conventions:
  - Rejected because conventions have already drifted and do not enforce boundaries.
- Derive lifecycle only in web without a domain lifecycle field:
  - Rejected because domain transitions become implicit and can diverge across agents/clients.

## Consequences

- Positive:
  - Deterministic render gating and reduced flapping risk.
  - Cleaner separation of concerns between agent domain state and frontend view-model state.
  - Easier cross-agent consistency and testing.
- Tradeoffs:
  - Requires breaking type/state refactors across agent contexts and web projections.
  - Requires updating call sites and tests to new naming and lifecycle semantics.
- Follow-on work:
  - Introduce `thread.lifecycle.phase` in agent state schemas and reducers.
  - Replace `view`/`AgentView` contracts with `ThreadState`/`UiState` equivalents.
  - Remove command-based rendering fallbacks from web hooks/components.
