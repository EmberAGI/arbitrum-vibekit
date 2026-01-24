# Troubleshooting: Update pnpm lockfile

Branch: feat/copilotkit-upgrade | Updated: 2026-01-23

## Current Focus

Working on: agent state not updating in UI
Approach: subscribe to agent state updates from useAgent and validate UI refresh

## Evidence Collected

- pnpm install --lockfile-only failed with ERR_PNPM_CATALOG_ENTRY_NOT_FOUND_FOR_SPEC
- Error message: "No catalog entry 'prettier' was found for catalog 'default'."
- Added catalog entries to web-ag-ui pnpm-workspace.yaml for prettier/tsx/viem
- pnpm install --lockfile-only succeeded with peer dependency warnings
- pnpm dev log shows agent failed with ERR_MODULE_NOT_FOUND for @langchain/langgraph
- apps/agent/node_modules was removed earlier; pnpm dev relies on it
- Reinstalled workspace node_modules and restarted pnpm dev; web and agent-clmm started cleanly
- agent-browser snapshot shows "Application error" client-side exception on / and /hire-agents
- Browser console shows repeated HMR WebSocket connection refused messages
- Runtime info endpoint responds with agent-clmm metadata
- No stack trace captured yet; will isolate by removing CopilotPopup/AppSidebar temporarily
- Runtime thread state includes populated view/profile after sync
- Web inspector shows agent-clmm state still default and no AG-UI events
- Suspect initial sync runs before runtime agent registry is ready; run happens on provisional agent instance
- UI still shows default state even after runtime connection log indicates connected
- Build failed when importing UseAgentUpdate from @copilotkitnext/react; export missing in runtime bundle
- TypeScript build failed when importing UseAgentUpdate type because module does not export it
- TypeScript build failed when onRuntimeConnectionStatusChanged event param was assumed to include runtimeConnectionStatus

## Assumptions

- Workspace is using pnpm catalog configuration that is missing prettier entry
- Lockfile update requires a valid catalog entry or disabling catalog resolution

## Attempts Log

2026-01-23 Attempt 1: pnpm install --lockfile-only in typescript/clients/web-ag-ui -> failed with missing prettier catalog entry
2026-01-23 Attempt 2: added catalog entries to web-ag-ui pnpm-workspace.yaml and reran pnpm install --lockfile-only -> succeeded with peer dependency warnings
2026-01-23 Attempt 3: pnpm lint in typescript/clients/web-ag-ui -> failed due to missing apps/agent node_modules
2026-01-23 Attempt 4: pnpm install in typescript/clients/web-ag-ui -> succeeded
2026-01-23 Attempt 5: pnpm lint && pnpm build in typescript/clients/web-ag-ui -> succeeded
2026-01-23 Attempt 6: pnpm dev in typescript/clients/web-ag-ui -> agent failed with ERR_MODULE_NOT_FOUND for @langchain/langgraph
2026-01-23 Attempt 7: pnpm install then pnpm dev in typescript/clients/web-ag-ui -> agent and agent-clmm started without errors
2026-01-23 Attempt 8: agent-browser open http://localhost:3000 and /hire-agents -> client-side exception page, console shows HMR websocket errors
2026-01-23 Attempt 9: added global error handler, captured stack pointing to unbound HttpAgent.runAgent in useAgentConnection runCommand
2026-01-23 Attempt 10: updated runCommand to call copilotkit.runAgent with bound agent; added @copilotkitnext/react dependency
2026-01-23 Attempt 11: restarted dev server, confirmed page loads without client errors
2026-01-24 Attempt 12: confirmed runtime state has values but UI inspector shows default state; suspect sync runs on provisional agent
2026-01-24 Attempt 13: migrated useAgentConnection to useAgent and gated sync on runtime connection -> UI still shows default metrics
2026-01-23 Attempt 14: planned to subscribe to agent state changes and store in React state to force UI updates
2026-01-23 Attempt 15: updated useAgent to request OnStateChanged updates to trigger rerenders
2026-01-23 Attempt 16: switched to type-only UseAgentUpdate import with string literal for updates to avoid runtime export
2026-01-23 Attempt 17: use string literal with useAgent parameter type extraction to avoid importing UseAgentUpdate
2026-01-23 Attempt 18: update runtime connection subscription to read copilotkit.runtimeConnectionStatus directly
2026-01-23 Attempt 19: add agent.subscribe onStateChanged/onRunInitialized to sync local state
2026-01-23 Attempt 20: remove local state to satisfy lint and keep onRunInitialized state sync
2026-01-23 Attempt 21: remove runtimeStatus gating; sync once per agent instance

## Discovered Patterns

- None yet

## Blockers/Questions

- None

## Resolution (when solved)

### Root Cause

- Pending

### Solution

- Pending

### Learnings

- Pending
