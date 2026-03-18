# ADR 0008: runtime-agnostic-shared-contract-extraction

Status: Accepted
Date: 2026-03-17

## Context

This ADR builds on ADR 0004 by separating runtime-neutral lifecycle and interaction contracts from LangGraph-specific enforcement and orchestration details.

ADR 0004 established stronger shared enforcement around transition and interrupt handling inside LangGraph-shaped workflow nodes, but the introduction of Pi-backed agents changes the shape of what should be shared:
- some concerns in `agent-workflow-core` are truly runtime-agnostic lifecycle and contract concerns
- other concerns are explicitly LangGraph workflow plumbing
- keeping both mixed together will either overfit Pi to LangGraph assumptions or duplicate contract logic across runtimes

The new Pi-backed agent is expected to reuse shared lifecycle, interrupt, and command semantics where appropriate, but it must not inherit LangGraph-specific runtime wiring just to access those contracts.

## Decision

Extract and maintain a runtime-agnostic shared contract layer for cross-runtime lifecycle and thread/task interaction semantics, while keeping LangGraph runtime helpers separate.

The shared contract layer is the right home for:
- task and lifecycle enums used at the `PiExecution` projection boundary
- command envelopes
- mutation acknowledgment semantics such as `clientMutationId`
- interrupt payload semantics
- projection-safe thread contract helpers
- other runtime-neutral schemas needed at AG-UI and frontend boundaries

The shared contract layer is not the right home for:
- LangGraph busy/checkpoint/run plumbing
- graph routing specifics
- runtime-specific node orchestration
- LangGraph package type-identity workarounds that only exist at that runtime boundary

This extraction should be done early enough that the Pi runtime and existing LangGraph runtimes both depend on the clarified contract boundary rather than letting the new Pi integration grow against a mixed package.

## Rationale

- Preserves reuse where the overlap is real without forcing a false "one runtime fits all" abstraction.
- Makes shared testing more meaningful because the tests can target cross-runtime contracts instead of one runtime's implementation details.
- Reduces the chance that Pi adapters or frontend code become coupled to LangGraph-specific vocabulary.
- Preserves one shared `Task` projection vocabulary for A2A and `web-ag-ui` without forcing that projection type to become the primary Pi domain record.
- Creates a cleaner basis for future A2A-aligned task semantics and runtime additions.

## Alternatives Considered

- Reuse `agent-workflow-core` as-is for Pi:
  - Rejected because it would import LangGraph-oriented assumptions into the Pi runtime boundary.
- Duplicate lifecycle and interrupt contracts inside Pi:
  - Rejected because it would create drift and duplicated cross-runtime logic.
- Delay extraction until after Pi implementation:
  - Rejected because it would make early Pi integration choices against muddled boundaries and raise later refactor cost.

## Consequences

- Positive:
  - Cleaner package boundaries and shared tests.
  - Lower risk of runtime-specific leakage into shared contracts.
  - Better support for multi-runtime coexistence in the same web surface.
- Tradeoffs:
  - Requires up-front refactor work before or alongside Pi runtime implementation.
  - Requires disciplined package naming and ownership boundaries to avoid recreating a mixed shared core.
- Follow-on work:
  - Inventory the current `agent-workflow-core` surface and classify each export as runtime-agnostic or runtime-specific.
  - Extract the runtime-agnostic contract layer and migrate both LangGraph and Pi consumers.
  - Add contract tests that both runtime families must satisfy.
