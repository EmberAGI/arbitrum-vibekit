# Ember Lending Agent

`agent-ember-lending` is the first concrete downstream managed subagent on the
public PI `agent-runtime` path.

This package currently establishes the thin blessed app scaffold:

- public `agent-runtime` consumption only
- app-owned runtime bootstrap
- AG-UI HTTP service mounting
- thin Shared Ember HTTP host and bounded subagent adapter

The intended downstream role for this agent is to act on a bounded Shared Ember
subagent surface for:

- portfolio-state reads
- planner-backed candidate-plan creation
- transaction execution preparation and local signing behind one execution tool
- escalation requests

Direct lending-agent onboarding is intentionally out of scope here. The
portfolio manager owns onboarding and activation; this runtime reads the
managed lane's current Shared Ember truth and projects the lending wallet,
mandate, reservation, planning, execution, and escalation state into AG-UI.

Current execution-context semantics:

- onboarding completion is expected to materialize the initial `ember-lending`
  lane for the first managed runtime pair
- `owned_units` and `reservations` remain agent-scoped to that lending lane
- `wallet_contents` reflects the full rooted wallet so the lending prompt can
  see total wallet inventory even when agent-scoped delegation state is still
  sparse
- `subagent_wallet_address` can still be `null` until a later delegation
  issuance path assigns a dedicated subagent wallet
- `authority_preparation_needed` stays runtime-internal; the adapter re-polls
  Shared Ember with a stage-scoped retry idempotency key until readiness
  advances or the local execution attempt fails closed
- local OWS signing stays inside the downstream service layer and must fail
  closed if the prepared signing package does not match the resolved dedicated
  subagent wallet identity

Runtime wiring:

- `SHARED_EMBER_BASE_URL` points the app at the bounded Shared Ember HTTP
  surface
- `EMBER_LENDING_OWS_BASE_URL` points the app at the local OWS signing surface
  used for redelegation and execution signing
- when `EMBER_LENDING_OWS_BASE_URL` is not configured, execution still uses the
  new prepare path but fails locally when Shared Ember reaches a signing-ready
  stage instead of falling back to the retired single-call execution path

Like the portfolio manager app, this package should stay a thin downstream app.
Shared Ember business logic and durable truth remain outside the app behind the
Shared Ember Domain Service boundary.
