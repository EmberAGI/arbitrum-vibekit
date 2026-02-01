# Troubleshooting: LangGraphAgent Connect Support

Branch: feat/copilotkit-upgrade | Updated: 2026-01-25

## Current Focus

Working on: Restore CLMM agent schema extraction in dev
Approach: Restart dev stack after simplifying CLMM state types

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
- LangGraphAgent connect test with streamResumable run: lastEventId=2, connect emitted STATE_SNAPSHOT with rawEventId=3 (replay resumes after lastEventId).
- Disconnect behavior: connect unsubscribed while run still running; run completed with status=success (no auto-cancel).
- Error path: invalid threadId triggers RUN_ERROR with 400 ZodError from LangGraph API.
- Cron implementation (agent-clmm) uses `clmmGraph.invoke` with `callbacks: []` in `runGraphOnce`, so cron ticks do not create API run streams.
- Thread isolation test: created run in thread A (status running) while thread B had zero runs; connect on thread B emitted RUN_STARTED/STATE_SNAPSHOT/RUN_FINISHED with runId distinct from thread A, no raw event thread_id/run_id leakage; thread A run completed successfully later.
- Manual API run + connect test (starterAgent, thread 019bf6fc...): connect emitted RUN_STARTED → STATE_SNAPSHOT → MESSAGES_SNAPSHOT → RUN_FINISHED only; no RAW events or intermediate snapshots observed.
- Connect instrumentation (starterAgent, thread e055ac8c...): runs.list returned active run id with status running; connect emitted RAW events + progressive STATE_SNAPSHOT updates (step 2→17) while run active.
- CLMM cron worker run failed when env file not loaded (missing A2A_TEST_AGENT_NODE_PRIVATE_KEY).
- CLMM API updateState required thread metadata graph_id; added thread metadata patch.
- CLMM cron run via API completed (~20s) with CLMM_DELEGATIONS_BYPASS=true; connect observed RUN_STARTED + STATE_SNAPSHOT while run active.
- CLMM cron run via API completed (~26s) with CLMM_DELEGATIONS_BYPASS=true; connect observed RUN_STARTED, RAW, multiple STATE_SNAPSHOT events, and RUN_FINISHED.
- Dev stack restart after CLMM state simplification removed schema extraction warnings; CLMM agent detail page loads with metrics/activity stream.
- Simplified CLMM message reducer and local CopilotkitState to avoid LangChain core schema types; CLMM schemas now return full input/output/state via /assistants/:id/schemas.
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
2026-01-24 Attempt 6: Initial Node script failed (ERR_MODULE_NOT_FOUND) because @ag-ui/langgraph not resolvable from workspace root.
2026-01-24 Attempt 7: Script via @copilotkit/runtime/langgraph succeeded; verified lastEventId replay, disconnect behavior, and RUN_ERROR on invalid thread.
2026-01-24 Attempt 8: Reviewed cron scheduler/runGraphOnce implementation; confirmed cron ticks bypass LangGraph API run streams.
2026-01-24 Attempt 9: Scripted thread isolation test; connect on thread B ignored active run in thread A.
2026-01-25 Attempt 10: Created API run and connected via LangGraphAgent; only a single snapshot and messages snapshot emitted, no streaming events.
2026-01-25 Attempt 11: Wrapped LangGraphAgent.connect to log runs.list; confirmed active run id detected and streaming snapshots/raw events emitted during run.
2026-01-25 Attempt 12: CLMM cron worker failed due to missing A2A_TEST_AGENT_NODE_PRIVATE_KEY when env file not loaded.
2026-01-25 Attempt 13: CLMM cron worker failed updateState with "Thread has no graph ID"; added thread metadata patch.
2026-01-25 Attempt 14: CLMM cron worker run completed via API; connect saw RUN_STARTED + STATE_SNAPSHOT (no RAW events).
2026-01-25 Attempt 15: CLMM cron worker run completed via API; connect saw RUN_STARTED/RAW/STATE_SNAPSHOT/MESSAGES_SNAPSHOT/RUN_FINISHED.
2026-01-25 Attempt 16: Restarted dev stack after CLMM state simplification; schema extraction errors cleared and agent UI renders.
2026-01-25 Attempt 17: Replaced messages reducer + CopilotkitState import with local types; lint/build pass and schema endpoint returns full graph schemas.

## Discovered Patterns

- Phase 2 validated via production runtime because dev watcher limits break Next dev.
- Validation gaps: Cron-driven runs lack API run streams by design; connect can only provide snapshots.
- Current API-run test still yields snapshot-only connect; need to verify if connect sees active run in runs.list.
- When connect attaches while run is running, it emits RAW + incremental STATE_SNAPSHOT events.

## Blockers/Questions

- Cron-driven run limitation confirmed by code inspection (no run streams).

## Resolution (when solved)

### Root Cause

- Runtime `agent/connect` handler only replayed historical run events and never invoked `LangGraphAgent.connect`, so no snapshots were emitted for existing thread state.

### Solution

- Patched `@copilotkitnext/runtime` connect handler to call `agent.connect` when available and stream the resulting snapshot events.
- Relaxed `@ag-ui/langgraph` schema fallback filtering so state values are not dropped when schemas are missing.
- `useAgentConnection` now explicitly connects the agent and runs a `sync` command once runtime status reaches Connected.

### Learnings

TBD
