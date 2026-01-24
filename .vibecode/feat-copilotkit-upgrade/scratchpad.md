# Troubleshooting: LangGraphAgent Connect Support

Branch: feat/copilotkit-upgrade | Updated: 2026-01-24

## Current Focus

Working on: Dashboard metrics no longer updating
Approach: Investigate connect snapshot/stream flow regressions

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

## Assumptions

- Thread-level streaming is available through the LangGraph SDK.
- CopilotKit connect clients can consume AG-UI events produced by LangGraphAgent.

## Attempts Log

2026-01-24 Attempt 1: Added assistant preload before getSchemaKeys in connect; repatched @ag-ui/langgraph and restarted web app.
2026-01-24 Attempt 2: Added explicit connect + sync after runtime connection; verified browser console still reports fetch failures to runtime.
2026-01-24 Attempt 3: Patched CopilotKit runtime connect handler to call agent.connect when available; metrics now populate in UI.

## Discovered Patterns

- None yet.

## Blockers/Questions

- None yet.

## Resolution (when solved)

### Root Cause

- Runtime `agent/connect` handler only replayed historical run events and never invoked `LangGraphAgent.connect`, so no snapshots were emitted for existing thread state.

### Solution

- Patched `@copilotkitnext/runtime` connect handler to call `agent.connect` when available and stream the resulting snapshot events.
- Relaxed `@ag-ui/langgraph` schema fallback filtering so state values are not dropped when schemas are missing.

### Learnings

TBD
