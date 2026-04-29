# Portfolio Manager Agent

`agent-portfolio-manager` is the concrete downstream orchestrator
implementation for the first Shared Ember Domain Service integration slice.

This package is expected to remain a thin `agent-runtime` consumer.

## Managed onboarding semantics

For the current Portfolio Manager -> Ember Lending pair, this app owns:

- user-facing mandate approval
- rooted-delegation signing handoff
- submission of the minimal onboarding activation contract to Shared Ember

Shared Ember remains the durable owner of wallet observation, accounting-unit
ingestion, reservation truth, and managed-lane materialization. The current
bootstrap path targets the managed lending mandate during onboarding
completion, so Shared Ember creates the initial `ember-lending` lane during
rooted bootstrap instead of reserving that capital under the portfolio-manager
agent id.

Runtime wiring:

- `SHARED_EMBER_BASE_URL` points the app at the bounded Shared Ember HTTP
  surface.
- `PORTFOLIO_MANAGER_OWS_WALLET_NAME` selects the direct OWS wallet the runtime
  should use for the orchestrator identity.
- `PORTFOLIO_MANAGER_OWS_PASSPHRASE` optionally unlocks that wallet when the
  vault requires it.
- `PORTFOLIO_MANAGER_OWS_VAULT_PATH` points the runtime at the vault containing
  the configured controller wallet.
- `ONCHAIN_ACTIONS_API_URL` optionally overrides the Onchain Actions API origin
  used by the hidden PM-owned `agent-oca-executor` swap path.
- `ARBITRUM_RPC_URL` and `ETHEREUM_RPC_URL` optionally override the RPC origins
  used when the hidden executor wraps OCA swap calls in the delegated execution
  transaction signed by the runtime-owned signer.
- `PORTFOLIO_MANAGER_OCA_EXECUTOR_OWS_WALLET_NAME`,
  `PORTFOLIO_MANAGER_OCA_EXECUTOR_OWS_PASSPHRASE`, and
  `PORTFOLIO_MANAGER_OCA_EXECUTOR_OWS_VAULT_PATH` select the direct OWS wallet
  for the hidden Onchain Actions executor identity and signing path.
- when `SHARED_EMBER_BASE_URL` is set for the live managed-onboarding path,
  startup now resolves the configured controller wallet directly from OWS core
  and confirms the
  durable `portfolio-manager` / `orchestrator` service identity in Shared Ember
  before the runtime is considered ready
- if the durable orchestrator identity is missing or points at a different
  wallet than the current OWS-resolved controller wallet, startup rewrites the
  durable identity record instead of continuing with stale state, using a fresh
  identity-scoped idempotency key for each distinct write
- startup treats the Shared Ember write as successful only when the response
  echoes back the confirmed `portfolio-manager` / `orchestrator` identity with
  the expected `agent_id`, `role`, and wallet address; if any part of that
  confirmation is missing or mismatched, the runtime fails closed
- startup also attempts best-effort registration or repair of the hidden
  `agent-oca-executor` / `subagent` identity with
  `visibility=internal`, `owner_agent_id=agent-portfolio-manager`,
  `worker_kind=execution`, `execution_surface=onchain_actions`, and
  `control_paths=["spot.swap"]`; hidden executor readiness does not block PM
  activation
- onboarding re-reads both required durable service identities before rooted
  bootstrap and blocks activation if either `portfolio-manager` /
  `orchestrator` or `ember-lending` / `subagent` is missing or unverified
- after rooted bootstrap succeeds, onboarding also reads
  `subagent.readExecutionContext.v1` for `ember-lending` and refuses to mark
  the portfolio manager active until Shared Ember exposes a non-null
  `subagent_wallet_address` for the managed lending lane
- if OWS is unavailable or does not resolve a controller wallet while Shared
  Ember is configured, the runtime fails closed before managed onboarding can
  proceed

## Hidden Onchain Actions executor

`agent-portfolio-manager` exposes a structured `dispatch_spot_swap` command for
PM-owned swap execution. The command accepts the Onchain Actions swap fields
`walletAddress`, `amount`, `amountType`, `fromChain`, `toChain`, `fromToken`,
`toToken`, and optional `slippageTolerance`, `expiration`, `idempotencyKey`, and
`rootedWalletContextId`.

The command dispatches a stateless hidden executor implementation for the exact
request. The executor resolves PM-facing tokens against the Onchain Actions token
catalog, prepares the swap with `/swap`, creates a Shared Ember `spot.swap`
transaction plan, requests execution readiness, wraps the returned OCA
transaction requests in the delegated execution transaction, signs through the
runtime-owned `oca-executor-wallet` signer, and submits the signed transaction
back through Shared Ember.

The hidden executor is not registered in the public web agent registry, CopilotKit
runtime registry, visible routes, or the public direct-command API. PM remains
the only user-facing imperative control plane for this swap path.

When Shared Ember reports `reserved_for_other_agent`, PM stores the exact pending
swap and interrupts for conflict-only confirmation. A retry sends the same swap
with `reservation_conflict_handling.kind` set to either
`allow_reserved_for_other_agent` or `unassigned_only`. User reserve policy remains
non-overridable.

## Shared Ember sidecar testing

This package does not vendor or commit private `ember-orchestration-v1-spec`
code into vibekit.

For real Shared Ember integration coverage, use the opt-in sidecar lane:

- set `RUN_SHARED_EMBER_INT=1`
- set `SHARED_EMBER_BASE_URL` to an already running Shared Ember HTTP service
  or set `EMBER_ORCHESTRATION_V1_SPEC_ROOT` to a local private checkout with
  dependencies installed
- set `PORTFOLIO_MANAGER_OWS_WALLET_NAME` and `PORTFOLIO_MANAGER_OWS_VAULT_PATH`
  when exercising the live startup identity-preflight path
- run `pnpm test:int`

When `EMBER_ORCHESTRATION_V1_SPEC_ROOT` is set, the integration test imports
the private repo's repo-local harness only to boot the HTTP service. The
assertions themselves still run against the HTTP/JSON-RPC boundary.

For the audited managed-onboarding proof on the current downstream boundary,
run from `typescript/clients/web-ag-ui/`:

- `pnpm smoke:managed-identities`

That smoke confirms:

- `portfolio-manager` / `orchestrator` resolves non-null in Shared Ember
- `ember-lending` / `subagent` resolves non-null in Shared Ember
- after rooted bootstrap, `subagent.readExecutionContext.v1` returns a non-null
  `subagent_wallet_address`

The smoke boots the real portfolio-manager and ember-lending runtime gateway
services and intentionally uses the current runtime-owned direct OWS wallet
path rather than `/identity` sidecars, repo-local identity stubs, or injected
wallet-address callbacks.
