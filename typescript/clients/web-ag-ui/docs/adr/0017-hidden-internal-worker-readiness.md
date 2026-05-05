# ADR 0017: hidden-internal-worker-readiness

Status: Accepted
Date: 2026-04-25

Supersedes: ADR 0014 for hidden internal worker readiness only.

## Context

ADR 0014 established a fail-closed service-identity preflight rule for the first
managed Shared Ember downstream pair:

- `portfolio-manager` / `orchestrator`
- `ember-lending` / `subagent`

That decision was correct for visible managed lanes whose readiness determines
whether managed onboarding can honestly be marked active.

Issue `#582` introduces a different runtime shape:

- PM remains the only user-facing control plane
- a hidden internal worker executes PM-owned Onchain Actions work
- the first hidden worker identity is `agent-oca-executor`
- the MVP capability is `spot.swap`
- the worker is not a visible managed lane
- the worker is not exposed in public registry, routes, CopilotKit, or public
  direct-command surfaces
- the worker relies on request-time readiness and authority preparation

Applying ADR 0014 literally to hidden internal workers would make PM activation
fail closed on a non-visible helper that is not required to render PM as hired
or active. That is the wrong product and runtime boundary.

## Decision

Split service-identity readiness into two classes.

### Visible Managed Services

Visible managed Shared Ember services keep the ADR 0014 fail-closed rule.

- Each visible managed service owns its own startup identity preflight.
- PM must fail closed when a required visible managed-lane service identity is
  missing, stale, or unverified.
- PM must not mark managed onboarding complete when required visible managed-lane
  execution context is absent.

### Hidden Internal Workers

Hidden internal workers use best-effort activation readiness and fail-closed
dispatch readiness.

For hidden internal workers such as `agent-oca-executor`:

- PM activation must not fail closed solely because the hidden worker identity is
  missing, stale, or temporarily unverifiable.
- PM activation may attempt best-effort eager registration or verification of
  hidden worker identity.
- First-use repair is allowed.
- The dispatch path must fail closed before executing if the hidden worker
  identity cannot be made valid for the exact worker and wallet context.
- The dispatch path must not bypass Shared Ember for domain truth, admission,
  reservation, delegation, accounting, or execution readiness.
- The hidden worker must carry durable metadata that distinguishes it from
  visible managed lanes.

Metadata for the first hidden worker:

```text
agent_id=agent-oca-executor
visibility=internal
owner_agent_id=agent-portfolio-manager
worker_kind=execution
execution_surface=onchain_actions
control_paths=["spot.swap"]
```

PM dispatch authorization uses owner and capability metadata plus server-side
runtime wiring, not public registry visibility.

## Rationale

- PM can be truthfully active without every hidden future helper being ready.
- Hidden internal workers are implementation/runtime helpers, not user-facing
  managed lanes.
- First-use repair preserves robustness without weakening execution safety,
  because execution still fails closed before signing/submission if identity or
  Shared Ember readiness cannot be established.
- The split keeps ADR 0014's original safety property for visible managed lanes
  while removing its overreach into hidden worker readiness.
- Capability metadata gives Shared Ember and Vibekit a durable way to recognize
  internal workers without exposing them in public UI or command surfaces.

## Alternatives Considered

- Keep ADR 0014 unchanged for all service identities:
  - rejected because it would block PM activation on hidden helpers that are not
    required for PM to be user-facing active.
- Make hidden worker identity optional at execution time:
  - rejected because execution/signing must still fail closed before any side
    effect when identity cannot be verified.
- Use a swap-specific durable identity such as `agent-swap-executor`:
  - rejected because the planned worker should expand from `spot.swap` to other
    Onchain Actions action-style endpoints without renaming identity, wallet, or
    provenance records.
- Expose the hidden worker as a visible managed lane to reuse existing readiness
  semantics:
  - rejected because the product requires PM to remain the only user-facing
    control plane for this path.

## Consequences

- Positive:
  - PM activation is no longer coupled to hidden worker readiness.
  - Hidden worker execution still remains fail-closed at the point where safety
    matters: dispatch and execution readiness.
  - Future Onchain Actions action-style endpoints can be added by capability
    metadata rather than by replacing the hidden worker identity.
- Tradeoffs:
  - Runtime startup and PM activation can appear healthy while a hidden worker
    still needs first-use repair.
  - The dispatch path must surface clear operator/user-facing failure when
    first-use repair cannot establish a valid hidden worker identity.
- Follow-on work:
  - ensure Shared Ember issue EmberAGI/ember-orchestration-v1-spec#275 gates
    internal-worker behavior by durable capability metadata
  - keep tests proving visible managed services remain fail-closed while hidden
    workers are best-effort during PM activation and fail-closed during dispatch
