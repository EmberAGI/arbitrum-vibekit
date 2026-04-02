# ADR 0014: fail-closed-service-identity-preflight-for-managed-shared-ember-agents

Status: Accepted
Date: 2026-04-02

## Context

The first managed Shared Ember downstream pair in `web-ag-ui` depends on two
durable role-scoped service identities:

- `portfolio-manager` / `orchestrator`
- `ember-lending` / `subagent`

Issue `#563` exposed that managed onboarding could appear healthy even when
those durable records were missing, stale, or did not match the wallet
currently resolved from the local OWS-facing service seam.

The downstream apps also need a clear readiness rule for the first managed lane
after rooted bootstrap:

- durable identity presence alone is not enough
- the portfolio-manager must not mark onboarding complete until Shared Ember
  exposes a non-null managed-lane `subagent_wallet_address`

At the same time, the repo already has a separate follow-on issue for deeper
OWS-internals refactoring. This ADR should ratify the current downstream
contract without pulling that separate work into the managed-onboarding bugfix
slice.

## Decision

For managed Shared Ember downstream agents in `web-ag-ui`:

- each service owns its own startup identity preflight
- each service must resolve its local wallet from the current OWS-facing HTTP
  seam before the runtime is considered ready
- each service must read the current durable Shared Ember service identity for
  its own `agent_id` and role
- if the durable identity is missing or points at a different wallet, the
  service must rewrite it before continuing
- each distinct identity rewrite must use a fresh identity-scoped idempotency
  key
- startup must fail closed unless Shared Ember echoes back the confirmed
  identity with the expected `agent_id`, role, and wallet address

Managed onboarding rules:

- portfolio-manager must re-read both required durable identities before rooted
  bootstrap
- portfolio-manager must block onboarding if either required identity is absent
  or unverified
- portfolio-manager must not mark onboarding complete until a follow-up
  `subagent.readExecutionContext.v1` read for `ember-lending` exposes a
  non-null `subagent_wallet_address`

Scope boundary:

- this ADR governs the current downstream OWS-facing HTTP seam only
- it does not decide where deeper OWS internals should eventually live
- the separate OWS-internals follow-up remains responsible for that refactor

## Rationale

- preserves correct ownership: orchestrator and subagent each prove only their
  own identity
- prevents managed onboarding from succeeding on stale or guessed wallet state
- makes local OWS resolution and Shared Ember durable state agree before the
  runtime appears healthy
- keeps the downstream managed-onboarding contract explicit while allowing a
  separate issue to change OWS internals later
- provides a concrete validation lane:
  - `pnpm smoke:managed-identities`

## Alternatives Considered

- allow onboarding to proceed when durable identities are missing:
  - rejected because it recreates the fail-open behavior from `#563`
- accept any non-null durable identity without comparing it to the current OWS
  wallet:
  - rejected because stale durable records are not safe readiness proof
- wait for execution-time hydration to discover the missing subagent wallet:
  - rejected because onboarding would already appear complete by then
- fold the deeper OWS-internals refactor into this decision:
  - rejected because that is a separate issue with a broader architectural
    surface

## Consequences

- Positive:
  - managed Shared Ember agents now have one clear startup and onboarding
    readiness contract
  - the runtime fails early with operator-visible errors instead of late
    downstream surprises
  - the repo has a repeatable smoke command for the audited proof surface
- Tradeoffs:
  - downstream apps remain temporarily coupled to the current OWS-facing HTTP
    seam until the follow-on issue lands
  - managed onboarding now depends on an extra post-bootstrap execution-context
    read before promotion to `active`
- Follow-on work:
  - keep docs and smoke output aligned with the current contract
  - let the separate OWS-internals issue change the seam later without
    weakening the fail-closed identity contract
