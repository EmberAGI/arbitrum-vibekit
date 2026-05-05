# Smoke Scripts

The shell health scripts below are intentionally thin and rely on already-running
local dev processes. The managed-identity smoke is different: it self-boots the
repo-local Shared Ember harness plus the real runtime-owned gateway services for
the managed pair.

For manual QA and any long-lived local service bring-up, Shared Ember should be
postgres-backed by default. Set
`SHARED_EMBER_PROTOCOL_REFERENCE_BOOTSTRAP_JSON='{"persistence":{"kind":"postgres","connectionString":"postgresql://ember:ember@127.0.0.1:55433/ember"}}'`
before starting the Shared Ember harness or reference server.

The harness's in-memory fallback is only appropriate for intentionally
short-lived smoke isolation. Do not use that fallback as the default QA stack,
because Shared Ember service identities and onboarding state will disappear on
restart.

## Assumptions

- `pnpm dev:delegations-bypass` is running from `typescript/clients/web-ag-ui/`.
- Web is reachable at `http://localhost:3000`.
- Agent-pendle LangGraph dev server is reachable at `http://localhost:8125`.

## Scripts

- `scripts/smoke/pendle-detail-page-health.sh`
  - Verifies the Pendle agent detail route does not render the Next.js "Application error" splash.

- `scripts/smoke/pendle-cron-ui-updates.sh`
  - Verifies `/api/agents/sync` reflects an increasing `metrics.iteration` over time.
  - Verifies the UI value on `/hire-agents/agent-pendle` increases over time (headless Playwright).
  - If you interrupt the script, it attempts to close the Playwright browser. If you still see noisy polling
    afterward, run `pnpm reset:dev-stack` (it also kills stale Playwright headless shells).

- `pnpm smoke:managed-identities`
  - Boots the repo-local Shared Ember HTTP harness plus the real
    `agent-portfolio-manager` and `agent-ember-lending` runtime gateway
    services.
  - If you want the smoke's Shared Ember state to survive restarts, export
    `SHARED_EMBER_PROTOCOL_REFERENCE_BOOTSTRAP_JSON` with postgres persistence
    before running it.
  - Confirms `portfolio-manager` / `orchestrator` and `ember-lending` / `subagent` are both non-null.
  - Drives the portfolio-manager rooted-bootstrap path and verifies post-bootstrap
    `subagent.readExecutionContext.v1` returns a non-null `subagent_wallet_address`.
  - This smoke intentionally exercises the current downstream runtime-owned
    direct OWS wallet path rather than `/identity` sidecars or injected
    wallet-address callback seams.

- `pnpm smoke:redelegation-browser-signing`
  - Bypasses the web UI and speaks only to the AG-UI agent surfaces.
  - Self-boots a repo-local Shared Ember HTTP harness plus fresh
    `agent-portfolio-manager` and `agent-ember-lending` processes on ephemeral
    ports as part of prep.
  - Starts the agents through their real `src/server.ts` entrypoints, so
    service identity registration happens through the same startup preflight
    path used in QA and production.
  - Uses the browser-style root delegation signing path:
    `signDelegationWithFallback(...)` plus an `eth_signTypedData_v4` wallet-provider shim.
  - Uses a same-address `Stateless7702` root account, then proves the full
    OWS child-redelegation and OWS execution-signing path through
    `portfolio-manager` and `ember-lending`.
  - Extracts the root-delegation signing request from the portfolio-manager
    interrupt payload and waits for lending hydration via lending snapshots,
    instead of reading Shared Ember JSON-RPC directly.
  - Proves the managed lending lifecycle through the agents themselves:
    onboarding, mandate activation, root delegation signing, child
    redelegation, an initial `lending.supply`, accounting/delegation refresh
    onto successor units, active `lending.withdraw` plus `lending.borrow`
    coverage after supply, then a follow-up unwind planned against
    `lending.withdraw` and executed through that refreshed delegation, then a
    third agent-driven plan proves fresh successor coverage exists again after
    the second execution.
  - Does not require pre-running `3420`, `3430`, or `4010`, but it still
    requires Arbitrum funding for the rooted wallet and OWS-controlled
    execution wallets.
  - Best run on fresh `pi_runtime` state. It now fails early if lending
    hydrates a stale mandate context for the same rooted wallet.

- `pnpm smoke:managed-idle-reconciliation`
  - Self-boots the repo-local Shared Ember harness plus fresh
    `agent-portfolio-manager` and `agent-ember-lending` processes by default.
  - Drives real managed onboarding, then uses the lending AG-UI chat surface to
    read inventory, execute the initial supply, read inventory again, and plan a
    follow-up borrow on the same thread.
  - Verifies the post-supply inventory turn mentions the live deployed
    successor unit instead of a stale predecessor id.
  - Verifies the follow-up borrow plan stays admitted on the same thread after
    that post-supply inventory turn.
  - Continues through a full `lending.withdraw` back to the rooted wallet.
  - Verifies post-withdraw `lending.supply` re-admission plus onboarding
    `phase: active` through ordinary Shared Ember read RPCs.
  - Transfers live WETH into and out of the rooted wallet from an external
    wallet and verifies ordinary portfolio reads ingest the resulting
    ingress/egress changes without repeated phantom deltas on follow-up reads.

- `pnpm smoke:portfolio-swap-ag-ui`
  - Speaks only to the portfolio-manager AG-UI surface; it does not call Shared
    Ember JSON-RPC directly and does not drive browser/UI components.
  - First completes portfolio-manager onboarding through the same AG-UI
    hire/setup/delegation-signing interrupt flow used by the app smoke. Then it
    uses ordinary user messages on that active thread to exercise one
    unreserved WETH -> USDC swap, one mixed unreserved-plus-reserved WETH ->
    USDC swap with a follow-up confirmation message, then one reserved-capital
    WETH -> USDC swap with a follow-up confirmation message.
  - Keeps assertions intentionally thin: the smoke fails on surfaced AG-UI
    errors/reverts, requires an AG-UI-surfaced execution transaction hash,
    waits for a successful receipt, and checks the root wallet actually moved
    WETH down and USDC up. It does not reimplement candidate-unit or
    reservation selection logic.
  - Reads an already-running wallet QA stack from
    `PM_SWAP_SMOKE_PORTFOLIO_MANAGER_BASE_URL`,
    `PORTFOLIO_MANAGER_AGENT_DEPLOYMENT_URL`, or the latest
    `runtime/wallet-qa-stack/launcher*.log` READY line.
  - Optional live setup: set `PM_SWAP_SMOKE_ENABLE_FUNDING=1` to top up the
    rooted wallet with ETH/WETH using the bundle's `FUNDING_WALLET_PRIVATE_KEY`.
    The reserved-capital lane still must exist in the real app/accounting
    state; the smoke does not seed fake reservations.
  - Useful overrides:
    `PM_SWAP_SMOKE_IDENTITIES_PATH`,
    `PM_SWAP_SMOKE_ROOT_WALLET_ADDRESS`,
    `ARBITRUM_RPC_URL`,
    `PM_SWAP_SMOKE_NON_RESERVED_PROMPT`,
    `PM_SWAP_SMOKE_MIXED_PROMPT`,
    `PM_SWAP_SMOKE_RESERVED_PROMPT`,
    `PM_SWAP_SMOKE_CONFIRM_PROMPT`,
    `PM_SWAP_SMOKE_MIN_ROOT_ETH`, and `PM_SWAP_SMOKE_MIN_ROOT_WETH`.

- `pnpm stack:wallet-qa`
  - Boots the local wallet QA stack for issue-driven debugging:
    `onchain-actions`, repo-local Shared Ember, `agent-portfolio-manager`,
    `agent-ember-lending`, and `apps/web`.
  - If `WALLET_QA_ONCHAIN_ACTIONS_API_URL` is set, the launcher treats
    `onchain-actions` as an external dependency, checks `/health` on that base
    URL, and skips starting the local `onchain-actions` worktree entirely.
  - Builds `apps/web` with the resolved wallet-QA env, then starts it through
    `next start` instead of `next dev` so the QA stack matches a production-like
    runtime path.
  - Resolves the session bundle and `onchain-actions` worktree from the active
    Forge session layout by default, then rewrites the archived envs at process
    start so the live stack uses the real extracted OWS vault paths and the
    actual `onchain-actions` origin.
  - Prefers an exported `OPENROUTER_API_KEY` over the archived bundle value for
    both managed agents, so live caller-provided credentials can be used without
    editing tracked env files.
  - Uses `postgresql://postgres:postgres@127.0.0.1:55432/pi_runtime` for the
    managed agents unless `WALLET_QA_PI_DATABASE_URL` is set.
  - Uses `postgresql://ember:ember@127.0.0.1:55433/ember` for Shared Ember
    unless `WALLET_QA_SHARED_EMBER_DATABASE_URL` is set.
  - If those local Postgres endpoints are unreachable and Docker is available,
    it tries to start `pi-runtime-postgres` and `shared-ember-postgres`
    automatically.
  - If Docker is unavailable but the session is running on a Debian host with
    `apt` and `dpkg-deb`, it falls back to
    `scripts/smoke/ensure-session-postgres.sh` and boots real Postgres 17
    clusters under the session runtime.
  - If the archived OWS vault contains duplicate wallet names, the launcher
    disambiguates them to exact wallet IDs before boot so the managed agents do
    not fail on ambiguous `*_OWS_WALLET_NAME` resolution.
  - `pnpm stack:wallet-qa -- --check` validates the resolved session paths,
    planned ports, and database readiness without starting the long-lived app
    processes.
  - `scripts/smoke/boot-wallet-qa-stack.sh` prefers the session-local
    `runtime/bin/node` wrapper when present, so Vibekit child processes inherit
    the recovered Node 22 binary from the active session runtime.

## Typical Local Flow

```bash
cd typescript/clients/web-ag-ui

# optional: reset thread/checkpointer state
pnpm reset:dev-stack

# start web + agents (delegations bypass)
PENDLE_POLL_INTERVAL_MS=5000 pnpm dev:delegations-bypass

# in another terminal
bash scripts/smoke/pendle-detail-page-health.sh
bash scripts/smoke/pendle-cron-ui-updates.sh

# managed Shared Ember identity proof
pnpm smoke:managed-identities

# browser-signing redelegation proof without the web app
pnpm smoke:redelegation-browser-signing

# managed idle-capital reconciliation proof without the web app
pnpm smoke:managed-idle-reconciliation

# portfolio-manager reserved and unreserved spot-swap proof without the web app
pnpm smoke:portfolio-swap-ag-ui
```
