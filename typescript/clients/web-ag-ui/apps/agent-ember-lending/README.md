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
- before healthy managed onboarding completes or when startup identity proof has
  not succeeded, `subagent_wallet_address` can still be `null`; after
  successful identity registration plus onboarding, the first healthy
  execution-context read is expected to expose the dedicated subagent wallet
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
  used for startup identity proof, redelegation, and execution signing
- when `SHARED_EMBER_BASE_URL` is set for the live managed path, startup now
  resolves the local signer wallet from OWS and confirms the durable
  `ember-lending` / `subagent` service identity in Shared Ember before the
  runtime is considered ready
- if the durable subagent identity is missing or points at a different wallet
  than the current OWS-resolved signer wallet, startup rewrites the durable
  identity record instead of continuing with stale state, using a fresh
  identity-scoped idempotency key for each distinct write
- startup treats the Shared Ember write as successful only when the response
  echoes back the confirmed `ember-lending` / `subagent` identity with the
  expected `agent_id`, `role`, and wallet address; if any part of that
  confirmation is missing or mismatched, the runtime fails closed
- if OWS is unavailable or does not resolve a signer wallet while Shared Ember
  is configured, startup fails closed instead of waiting for a later
  execution-time signing failure
- portfolio-manager activation is expected to block until this durable
  `ember-lending` / `subagent` identity exists and matches the current OWS
  wallet

Like the portfolio manager app, this package should stay a thin downstream app.
Shared Ember business logic and durable truth remain outside the app behind the
Shared Ember Domain Service boundary.
