# Troubleshooting: LangGraphAgent Connect Support

Branch: feat/copilotkit-upgrade | Updated: 2026-01-24

## Current Focus

Working on: Phase 2 connect validation (active run attach)
Approach: Validate connect stream with starterAgent long-running stream

## Evidence Collected

- User request: implement connect directly in LangGraphAgent via pnpm patch for upstream PR.
- Client uses deterministic thread IDs for persistence.
- UI report: top metrics (7D income, APY, users, AUM, points) no longer updating.
- Connect implementation called getSchemaKeys before loading assistant, so schemaKeys fell back to constant keys (messages/tools) and filtered out view metrics from snapshots.
- Agent-browser snapshot shows table row values still $0/0 and CopilotKit inspector reports "No events yet" even though runtime connection is established.
- Browser console shows repeated `Agent execution failed: TypeError: Failed to fetch` for connect/run requests, indicating runtime requests aren't completing.
- LangGraph thread state at `http://localhost:8124/threads/c0bf.../state` includes profile metrics (agentIncome 3250, apy 120.5, users 42, aum 25000).
- LangGraph assistant schemas response includes only config/context schemas (no input/output), so schema filtering should be bypassed.
- CopilotKit runtime connect handler streamed no events because it only replayed stored runs, not agent connect snapshots.
- Dev server hit EMFILE watch errors and returned 404s; switched to production build + start for agent-browser validation.
- Prod run (starterAgent stream command) showed RUN_STARTED/STATE_SNAPSHOT/RAW_EVENT/RUN_FINISHED entries in AG-UI Events panel.
- Phase 1 snapshot connect confirmed via RUN_STARTED → STATE_SNAPSHOT/MESSAGES_SNAPSHOT → RUN_FINISHED.
- Phase 2 active run attach confirmed via pending/running run detection + joinStream events.
- Patched files:
  - `typescript/clients/web-ag-ui/patches/@ag-ui__langgraph@0.0.20.patch`
  - `typescript/clients/web-ag-ui/patches/@copilotkitnext__runtime@0.0.33.patch`
  - `typescript/clients/web-ag-ui/apps/web/src/hooks/useAgentConnection.ts`
- LangGraph thread state endpoint example: `http://localhost:8124/threads/<threadId>/state`.
- Expected dashboard metrics from thread state: users 42, 7d income 3250, APY 120.5, AUM 25000, points 0.

## Assumptions

- Thread-level streaming is available through the LangGraph SDK.
- CopilotKit connect clients can consume AG-UI events produced by LangGraphAgent.

## Attempts Log

2026-01-24 Attempt 1: Added assistant preload before getSchemaKeys in connect; repatched @ag-ui/langgraph and restarted web app.
2026-01-24 Attempt 2: Added explicit connect + sync after runtime connection; verified browser console still reports fetch failures to runtime.
2026-01-24 Attempt 3: Patched CopilotKit runtime connect handler to call agent.connect when available; metrics now populate in UI.
2026-01-24 Attempt 4: Dev server hit EMFILE watch errors and served 404s; switched to production build + start to validate live connect streams.
2026-01-24 Attempt 5: Validated Phase 2 in production mode; active run attach delivered stream events in AG-UI Events panel.

## Discovered Patterns

- Phase 2 validated via production runtime because dev watcher limits break Next dev.
- Validation gaps: Last-Event-ID replay behavior, client disconnect handling, explicit error surfacing, cron-driven runs.

## Blockers/Questions

- Still need to validate Last-Event-ID replay, disconnect handling, error path, and cron-driven run limitations per PRD.

## Resolution (when solved)

### Root Cause

- Runtime `agent/connect` handler only replayed historical run events and never invoked `LangGraphAgent.connect`, so no snapshots were emitted for existing thread state.

### Solution

- Patched `@copilotkitnext/runtime` connect handler to call `agent.connect` when available and stream the resulting snapshot events.
- Relaxed `@ag-ui/langgraph` schema fallback filtering so state values are not dropped when schemas are missing.
- `useAgentConnection` now explicitly connects the agent and runs a `sync` command once runtime status reaches Connected.

### Learnings

TBD
