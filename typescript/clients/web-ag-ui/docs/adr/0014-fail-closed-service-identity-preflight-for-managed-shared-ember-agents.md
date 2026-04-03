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
currently resolved through the private `agent-runtime` identity/signing
internals backed directly by `@open-wallet-standard/core`.

The downstream apps also need a clear readiness rule for the first managed lane
after rooted bootstrap:

- durable identity presence alone is not enough
- the portfolio-manager must not mark onboarding complete until Shared Ember
  exposes a non-null managed-lane `subagent_wallet_address`

ADR 0011 already ratifies that runtime assembly and private integration seams
belong inside `agent-runtime`, not in downstream app-owned transport or helper
surfaces. This ADR narrows that ownership to the fail-closed managed-identity
readiness contract for Shared Ember onboarding.

## Decision

For managed Shared Ember downstream agents in `web-ag-ui`:

- each service owns its own startup identity preflight
- each service must resolve its service wallet through private
  `agent-runtime` identity/signing internals backed directly by
  `@open-wallet-standard/core` before the runtime is considered ready
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

- this ADR governs fail-closed managed-identity readiness on top of
  runtime-owned direct OWS-core integration
- it does not make OWS internals part of any public downstream app contract
- the readiness and verification rules here must remain true even if the
  private runtime implementation details change later

## Rationale

- preserves correct ownership: orchestrator and subagent each prove only their
  own identity
- prevents managed onboarding from succeeding on stale or guessed wallet state
- makes runtime-owned wallet resolution and Shared Ember durable state agree
  before the runtime appears healthy
- keeps the managed-onboarding contract explicit without teaching downstream
  apps to depend on private OWS implementation seams
- provides a concrete validation lane:
  - `pnpm smoke:managed-identities`, which boots the real managed-pair gateway
    services, proves both durable role-scoped identities are non-null, and
    proves rooted bootstrap hydrates a non-null managed-lane
    `subagent_wallet_address`

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
  - the readiness contract now depends on `agent-runtime` continuing to own the
    private wallet-resolution path instead of downstream apps providing their
    own seam
  - managed onboarding now depends on an extra post-bootstrap execution-context
    read before promotion to `active`
- Follow-on work:
  - keep docs and smoke output aligned with the current contract
  - keep ADR 0011 and this ADR aligned so runtime-owned OWS internals remain a
    private implementation detail without weakening the fail-closed identity
    contract
