# Smoke Scripts

The shell health scripts below are intentionally thin and rely on already-running
local dev processes. The managed-identity smoke is different: it self-boots the
repo-local Shared Ember harness plus the real runtime-owned gateway services for
the managed pair.

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
  - Drives real managed onboarding, initial `lending.supply`, and a full
    `lending.withdraw` back to the rooted wallet.
  - Verifies post-withdraw `lending.supply` re-admission plus onboarding
    `phase: active` through ordinary Shared Ember read RPCs.
  - Transfers live WETH into and out of the rooted wallet from an external
    wallet and verifies ordinary portfolio reads ingest the resulting
    ingress/egress changes without repeated phantom deltas on follow-up reads.

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
```
