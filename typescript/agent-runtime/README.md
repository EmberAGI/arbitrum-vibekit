# agent-runtime

`agent-runtime` is the builder-facing package for bespoke agents on the Pi-backed runtime.

Consumers should depend on `agent-runtime` instead of wiring the internal runtime-family packages together directly.

## Directory layout

- `agent-runtime/`: public builder-facing facade package
- `agent-runtime/lib/contracts`: runtime-neutral contracts and projection-safe shared helpers
- `agent-runtime/lib/pi`: Pi gateway implementation and builder-facing runtime factories
- `agent-runtime/lib/postgres`: Postgres bootstrap, persistence, recovery, and transaction helpers
- `clients/web-ag-ui/apps/agent-runtime-langgraph`: LangGraph-specific helpers for the existing web-ag-ui agent apps

## Public facade responsibilities

- Re-export the shared runtime-neutral contracts needed at the AG-UI and runtime boundary.
- Re-export the Pi gateway builders and types used to construct the public runtime surface.

## Supporting internal packages

- `agent-runtime-contracts`: runtime-neutral contracts and projection-safe shared helpers.
- `agent-runtime-pi`: Pi gateway implementation and builder-facing runtime factories.
- `agent-runtime-postgres`: Postgres bootstrap, persistence, recovery, and transaction helpers that support the Pi runtime implementation.

## Explicitly outside this package family

- `agent-runtime-langgraph`
- `agent-workflow-core`

Those packages remain outside the Pi runtime facade unless later work intentionally adopts them. `agent-runtime-langgraph` stays colocated with the existing `clients/web-ag-ui/apps/*` LangGraph agents rather than under `typescript/agent-runtime/`.
