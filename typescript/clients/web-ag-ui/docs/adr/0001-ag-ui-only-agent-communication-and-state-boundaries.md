# ADR 0001: ag-ui-only-agent-communication-and-state-boundaries

Status: Accepted
Date: 2026-02-18

## Context

The current web and agent architecture has split state ownership and inconsistent lifecycle behavior:
- Web can observe multiple concurrent runs beyond expected agent count.
- Detail-page streaming connections may remain open after focus changes.
- `/api/agents/sync` introduces out-of-band thread state synchronization outside AG-UI semantics.
- Agent implementations diverge in lifecycle and polling patterns.
- Frontend detail rendering has grown into a god component, including agent-specific metrics logic in one file.

The target direction already documented in the C4 architecture is to make AG-UI the only web-to-agent communication contract and establish clearer boundaries for state transitions and connection lifecycle.

## Decision

Adopt AG-UI protocol operations (`connect`, `run`, `stop`) as the exclusive contract between web and agents, with these architectural constraints:
- Web must not read or mutate LangGraph thread state through non-AG-UI endpoints.
- Sidebar status updates must use bounded polling and never own long-lived detail streams.
- Detail-page stream attachment is focus-scoped and must close on unfocus/navigation.
- Agent-side lifecycle transitions should converge toward a shared kernel contract across `apps/agent*`.
- Agent-specific metrics UI must be decomposed via a registry-driven renderer model, not centralized branching in a single detail component.
- Web command concurrency and stream authority rules are governed by explicit client runtime invariants (`docs/ag-ui-client-runtime-invariants.md`), including `sync` coalescing and `fire` preemptive behavior.
- Local patch exception is allowed for `@ag-ui/langgraph` `connect` behavior until upstream parity is available.

## Rationale

- Enforcing one protocol boundary reduces split-brain bugs and duplicated state machines.
- Focus-scoped stream lifecycle prevents leaked connections and unintended run fan-out.
- Shared lifecycle contracts across agents reduce divergence and undefined transition behavior.
- Metrics decomposition improves maintainability and isolates domain-specific rendering concerns.
- The upstream `@ag-ui/langgraph` package does not yet expose required `connect` parity, so immediate patch retirement would regress behavior.

## Alternatives Considered

- Keep `/api/agents/sync` as a permanent side channel:
  - Rejected because it duplicates agent state concerns and undermines AG-UI as the single contract.
- Remove all local patches immediately:
  - Rejected because upstream still lacks required `connect` behavior for thread attach/resume parity.
- Keep a single monolithic `AgentDetailPage` and continue branching by `agentId`:
  - Rejected because complexity growth is already high and inhibits safe evolution of agent-specific metrics.
- Refactor only frontend without agent lifecycle alignment:
  - Rejected because lifecycle divergence in `apps/agent*` would continue to create inconsistent state behavior.

## Consequences

- Positive:
  - Clear communication boundary and reduced coupling between UI and agent internals.
  - Lower risk of connection leaks and run over-subscription.
  - Better modularity for adding new agent metric experiences.
- Negative/tradeoffs:
  - Requires migration work to remove `/api/agents/sync` dependencies.
  - Requires shared lifecycle abstractions for agents and coordinated rollout.
  - Patch maintenance burden remains until upstream `connect` parity is available.
- Follow-on work:
  - Implement metrics renderer registry and split per-agent components.
  - Introduce stream manager ownership and focus lifecycle guards.
  - Extract shared agent lifecycle kernel and align onboarding/poll-cycle contracts.
  - Implement `AgentCommandScheduler` in web to enforce documented client runtime invariants for concurrency and busy-run handling.
