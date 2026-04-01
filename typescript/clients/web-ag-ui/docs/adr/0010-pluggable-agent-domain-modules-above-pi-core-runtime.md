# ADR 0010: pluggable-agent-domain-modules-above-pi-core-runtime

Status: Superseded by ADR 0011
Date: 2026-03-18

## Context

The Pi-backed architecture now has a clearer foundational runtime model:
- `PiThread`
- `PiExecution`
- `PiAutomation`
- `AutomationRun`

That core model is intentionally about durable execution, persistence, interrupts, automation firing, and protocol projection boundaries. It is not, by itself, the right place to encode opinionated user-facing workflows such as hire, setup, sync, or fire.

Those flows are:
- higher-level than the execution core
- specific to the current DeFi agent family
- likely to vary across future agent types

If we bake those lifecycle terms directly into the foundational Pi runtime model, the core becomes too opinionated and less reusable. If we push them out into AG-UI/A2UI adapters or frontend-only logic, the runtime loses ownership of important domain rules and state transitions.

We need an architecture boundary that keeps the core runtime reusable while allowing agent-specific lifecycle systems to remain Pi-owned and testable.

## Decision

Adopt a pluggable agent-domain-module layer above the Pi core runtime model.

Layering:
- Pi core runtime
  - owns `PiThread`, `PiExecution`, `PiAutomation`, `AutomationRun`
  - owns interrupts, artifacts, persistence, automation scheduling, outbox/dedupe, and protocol projections
- Agent domain module
  - owns agent-specific lifecycle states and transitions
  - owns domain-specific commands and policies
  - owns domain-specific interrupt schemas
  - owns domain-specific current-state and activity projection rules
  - owns domain-specific A2UI payload/artifact production
- Protocol/channel adapters
  - AG-UI
  - future A2A adapter
  - future Telegram adapter

Rules:
- The Pi core runtime must not assume one universal lifecycle vocabulary for all agent types.
- Higher-level workflows such as hire/setup/sync/fire belong in a Pi-owned agent domain module, not in the AG-UI adapter and not in the frontend.
- Different agent families may supply different lifecycle vocabularies, interrupt schemas, and artifact shapes while reusing the same core runtime model.
- The reusable boundary is the domain-module contract, not a forced universal lifecycle terminology.
- Protocol adapters project the outputs of the active agent domain module; they do not become the source of truth for domain lifecycle semantics.

## Rationale

- Keeps the core runtime focused on durable execution and automation boundaries rather than agent-specific business workflows.
- Allows DeFi agents to keep opinionated lifecycle flows without forcing those terms onto every future agent type.
- Preserves Pi as the owner of domain rules, interrupts, and lifecycle transitions instead of leaking them into AG-UI or React.
- Gives us a clean extensibility seam for future agent families with different workflows.
- Makes testing cleaner by separating:
  - core runtime invariants
  - domain-module invariants
  - adapter projection correctness

## Alternatives Considered

- Put hire/setup/sync/fire directly into the core runtime model:
  - Rejected because it overfits the foundational runtime to one agent family.
- Keep lifecycle flows only in AG-UI/A2UI adapters:
  - Rejected because adapters should project domain state, not own domain truth.
- Try to define one universal lifecycle vocabulary for every agent type:
  - Rejected because it would likely become too abstract to be useful or too opinionated to be reusable.
- Let each agent implementation invent lifecycle handling ad hoc:
  - Rejected because it would recreate the drift and inconsistency problems this architecture is supposed to prevent.

## Consequences

- Positive:
  - Core runtime stays reusable and less opinionated.
  - Agent-specific workflows remain first-class and Pi-owned.
  - Future agent types can reuse the same execution model with different domain modules.
- Tradeoffs:
  - Adds one more explicit architectural layer to define and test.
  - Requires a stable domain-module contract and clear boundaries for projection responsibilities.
- Follow-on work:
  - Define the contract shape for a pluggable agent domain module.
  - Ensure the Pi C4 diagrams and parent PRD show the domain-module layer explicitly.
  - Keep shared runtime-neutral contracts separate from agent-family-specific lifecycle modules.
