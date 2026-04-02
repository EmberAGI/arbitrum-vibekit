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
- `PORTFOLIO_MANAGER_OWS_BASE_URL` points the app at the local OWS controller
  identity surface.
- when `SHARED_EMBER_BASE_URL` is set for the live managed-onboarding path,
  startup now resolves the local controller wallet from OWS and confirms the
  durable `portfolio-manager` / `orchestrator` service identity in Shared Ember
  before the runtime is considered ready
- if the durable orchestrator identity is missing or points at a different
  wallet than the current OWS-resolved controller wallet, startup rewrites the
  durable identity record instead of continuing with stale state
- onboarding re-reads both required durable service identities before rooted
  bootstrap and blocks activation if either `portfolio-manager` /
  `orchestrator` or `ember-lending` / `subagent` is missing or unverified
- if OWS is unavailable or does not resolve a controller wallet while Shared
  Ember is configured, the runtime fails closed before managed onboarding can
  proceed

## Shared Ember sidecar testing

This package does not vendor or commit private `ember-orchestration-v1-spec`
code into vibekit.

For real Shared Ember integration coverage, use the opt-in sidecar lane:

- set `RUN_SHARED_EMBER_INT=1`
- set `SHARED_EMBER_BASE_URL` to an already running Shared Ember HTTP service
  or set `EMBER_ORCHESTRATION_V1_SPEC_ROOT` to a local private checkout with
  dependencies installed
- set `PORTFOLIO_MANAGER_OWS_BASE_URL` when exercising the live startup
  identity-preflight path
- run `pnpm test:int`

When `EMBER_ORCHESTRATION_V1_SPEC_ROOT` is set, the integration test imports
the private repo's repo-local harness only to boot the HTTP service. The
assertions themselves still run against the HTTP/JSON-RPC boundary.
