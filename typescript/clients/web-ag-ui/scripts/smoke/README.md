# Smoke Scripts

These scripts are intentionally "thin" and rely on already-running local dev processes.

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
```
