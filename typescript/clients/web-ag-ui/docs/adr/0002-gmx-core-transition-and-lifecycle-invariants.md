# ADR 0002: gmx-core-transition-and-lifecycle-invariants

Status: Accepted
Date: 2026-02-23

## Context

GMX workflow nodes had accumulated local transition and lifecycle handling patterns that bypassed shared `agent-workflow-core` invariants:
- Nodes constructed LangGraph `Command` transitions directly, including non-interrupt routing and terminal behavior.
- `goto` was used for normal routing branches, not just interrupt pause/resume control flow.
- Shared lifecycle updates (onboarding/task/summary busy-run handling) were not consistently governed through core-owned pathways.
- Cross-package nominal typing for LangGraph `Command` caused type identity friction when command objects were constructed across package boundaries.

This created drift risk across agents and weakened the intended core-first invariant model.

## Decision

For GMX shared lifecycle behavior, adopt a core-first invariant contract with these rules:
- Shared non-default transitions must be produced via `agent-workflow-core` transition helper contracts (`buildInterruptPauseTransition`, `buildTerminalTransition`) rather than direct node-level transition construction.
- `goto` is reserved for interrupt pause/resume flows only. Normal/error/terminal routing must be expressed through graph conditional routing and state updates.
- Explicit terminal transitions must be emitted through core terminal helper contracts.
- Shared lifecycle state evolution must flow through core-governed lifecycle utilities and typed update shapes, with graph-level resolvers determining normal branch routing.
- Runtime invariant violations in governed paths must fail fast; no silent fallback behavior.
- LangGraph `Command` object construction remains in a GMX-local command factory to avoid cross-package nominal type identity conflicts while preserving core-owned transition contracts.

## Rationale

- Centralizing transition semantics in core enforces consistent behavior and reduces per-node drift.
- Restricting `goto` to interrupt-only control flow improves graph clarity and keeps normal routing explicit at graph edges.
- Fast failure on invariant breaches preserves correctness and diagnosability.
- Keeping `Command` object instantiation local to GMX avoids nominal type mismatch problems while still enforcing core transition policy at the contract boundary.
- State-driven routing with graph conditional resolvers improves reuse and aligns with multi-agent lifecycle convergence goals.

## Alternatives Considered

- Keep direct node-level `new Command(...)` usage with review-time conventions:
  - Rejected because conventions alone do not prevent bypass regressions.
- Allow non-interrupt `goto` in nodes for convenience:
  - Rejected because it obscures routing intent and reintroduces inconsistent branch semantics.
- Construct LangGraph `Command` in `agent-workflow-core` directly:
  - Rejected due to cross-package nominal type identity issues for `Command`.
- Soft-fail invariant breaches with warnings:
  - Rejected because warnings permit silent state divergence in production paths.

## Consequences

- Positive:
  - GMX lifecycle behavior now follows shared transition and routing contracts with stronger guardrails.
  - Node logic is simpler and more testable via state updates + graph-level resolvers.
  - Transition helper APIs are reusable by other agent packages.
- Tradeoffs:
  - Adds core API surface and migration overhead.
  - Requires discipline to keep command object construction behind local factory boundaries where package-type identity matters.
- Follow-on work:
  - Expand this invariant model to other agent packages.
  - Continue consolidating shared lifecycle patch/command-write policies in core without overfitting agent-specific schemas.
