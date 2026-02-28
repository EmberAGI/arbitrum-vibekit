# ADR 0004: shared-core-transition-and-interrupt-enforcement

Status: Accepted
Date: 2026-02-28

## Context

Transition and interrupt handling patterns drifted across agents:
- Some nodes used direct LangGraph transition construction while others used shared helpers.
- Interrupt payload decoding (`string` vs object) was implemented ad hoc with repeated manual `JSON.parse`.
- Checkpoint/pause semantics before interrupt were not uniformly enforced.

CLMM onboarding nodes were migrated to shared helpers, but Pendle/GMX and non-onboarding paths still include bypasses.

## Decision

Adopt a shared-core enforcement contract for node transition and interrupt handling:
- Node transition/state returns that affect workflow lifecycle must use `agent-workflow-core` helpers:
  - `buildNodeTransition`
  - `buildStateUpdate`
  - `buildInterruptPauseTransition`
  - `buildTerminalTransition` (when applicable)
- Interrupt request + payload decode must use shared wrapper flow:
  - `requestInterruptPayload` (and shared decode behavior), not ad hoc manual parse blocks.
- Direct `interrupt()` and manual payload parsing in workflow nodes are disallowed except inside approved shared-core wrappers.
- Where package type-identity requires local command instantiation, local command factories are allowed only as adapters invoked by shared-core helper contracts.

## Rationale

- Shared helper pathways centralize invariants and reduce node-by-node drift.
- Uniform interrupt decode/pause behavior eliminates repeated bugs and inconsistent resume semantics.
- Adapter-based local command instantiation preserves type-safety constraints without giving up shared policy enforcement.

## Alternatives Considered

- Keep mixed local patterns with code-review enforcement:
  - Rejected because drift has already occurred and review alone is insufficient.
- Standardize only CLMM and defer other agents indefinitely:
  - Rejected because cross-agent inconsistency undermines shared runtime behavior.
- Wrap only payload decoding but allow direct transition construction everywhere:
  - Rejected because lifecycle invariants must also be enforced at transition/state return boundaries.

## Consequences

- Positive:
  - Consistent transition/interrupt behavior across agent packages.
  - Better observability and lower regression surface for UI stability issues.
  - Stronger enforcement of lifecycle invariants in one place.
- Tradeoffs:
  - Requires migration work in Pendle/GMX and remaining CLMM nodes.
  - Requires guardrails (tests/lint/policy checks) to prevent reintroduction of bypass patterns.
- Follow-on work:
  - Migrate remaining direct transition/interrupt patterns to shared-core helpers.
  - Add boundary guardrails for direct `interrupt()` or manual parse usage in workflow nodes.
