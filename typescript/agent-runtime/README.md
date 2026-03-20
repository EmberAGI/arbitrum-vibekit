# agent-runtime

`agent-runtime` is the builder-facing package for bespoke agents on the Pi-backed runtime.

Consumers should depend on `agent-runtime` instead of wiring the internal runtime-family packages together directly.

## Directory layout

- `agent-runtime/`: public builder-facing facade package
- `agent-runtime/lib/contracts`: runtime-neutral contracts and projection-safe shared helpers
- `agent-runtime/lib/pi`: Pi gateway implementation and builder-facing runtime factories
- `agent-runtime/lib/postgres`: Postgres bootstrap, persistence, recovery, and transaction helpers

## Public facade responsibilities

- Re-export the shared runtime-neutral contracts needed at the AG-UI and runtime boundary.
- Re-export the Pi gateway builders and types used to construct the public runtime surface.

## Supporting internal packages

- `agent-runtime-contracts`: runtime-neutral contracts and projection-safe shared helpers.
- `agent-runtime-pi`: Pi gateway implementation and builder-facing runtime factories.
- `agent-runtime-postgres`: Postgres bootstrap, persistence, recovery, and transaction helpers that support the Pi runtime implementation.
