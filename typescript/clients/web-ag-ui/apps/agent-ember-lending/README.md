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
- transaction execution preparation and runtime-owned signing behind one
  execution tool
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
- direct OWS signing stays inside the private runtime service layer and must
  fail closed if the prepared signing package does not match the resolved
  dedicated subagent wallet identity
- the live managed path now anchors planner-returned transaction payload refs
  behind the lending service boundary via Onchain Actions, stores the full
  ordered transaction-request sequence in runtime-owned persisted domain state,
  and resolves the exact unsigned transaction bytes for the requested step only
  at execution time using the managed wallet address plus chain RPC state,
  instead of relying on a process-local map or a test-only harness seam
- `create_transaction_plan` now fails closed unless that service-owned
  anchoring step succeeds; missing planner payload metadata, missing managed
  wallet context, or missing anchored-resolver wiring must stop plan creation
  before a locally executable candidate plan is recorded

Planner input contract:

- `create_transaction_plan` accepts `requested_quantities` either as an array
  of `{ unit_id, quantity }` objects or as an object map of `unit_id` to
  `quantity`
- every `requested_quantities` value must be a base-unit decimal string such as
  `"5000000"`, not a number literal
- omit `requested_quantities` only when the caller clearly wants the full or
  max-possible managed amount already projected by Portfolio Manager
- explicit malformed or mixed-validity `requested_quantities` input now fails
  closed locally before the handoff reaches Shared Ember

Runtime wiring:

- `SHARED_EMBER_BASE_URL` points the app at the bounded Shared Ember HTTP
  surface
- `ONCHAIN_ACTIONS_API_URL` optionally overrides the Onchain Actions API origin
  used for service-owned planner payload anchoring and ordered transaction-step
  resolution
- `ARBITRUM_RPC_URL` and `ETHEREUM_RPC_URL` optionally
  override the chain RPC endpoints the lending service uses to prepare the
  requested unsigned transaction bytes just before runtime signing
- `EMBER_LENDING_OWS_WALLET_NAME` selects the direct OWS wallet the runtime
  should use for startup identity proof, redelegation, and execution signing
- `EMBER_LENDING_OWS_PASSPHRASE` optionally unlocks that wallet when the vault
  requires it
- `EMBER_LENDING_OWS_VAULT_PATH` points the runtime at the vault containing the
  configured wallet
- when `SHARED_EMBER_BASE_URL` is set for the live managed path, startup now
  resolves the configured signer wallet directly from OWS core and confirms the durable
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

Validation note:

- run `pnpm smoke:managed-identities` from `typescript/clients/web-ag-ui/` to
  prove the current downstream pair can confirm both durable identities and
  surface a non-null post-bootstrap `subagent_wallet_address`
- that smoke now exercises the runtime-owned direct OWS wallet path rather than
  a repo-local HTTP sidecar seam
- run `RUN_SHARED_EMBER_INT=1 EMBER_ORCHESTRATION_V1_SPEC_ROOT=<private-repo-root> pnpm --filter agent-ember-lending test:int -- src/sharedEmberAdapter.int.test.ts`
  to prove the real runtime-owned redelegation typed-data signing path plus the
  service-owned Onchain Actions anchored-payload resolution seam
