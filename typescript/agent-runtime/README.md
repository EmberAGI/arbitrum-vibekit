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

## Builder-facing runtime path

Consumers should integrate through projection-shaped public inputs, not by constructing PI runtime session objects.

The intended builder-facing path is:

1. Define or reuse domain-module / projection-hook outputs as `PiRuntimeGatewayThreadProjection` values.
2. Keep per-thread projection state in `createPiRuntimeGatewayProjectionStore(...)`.
3. Pass `getProjectionContext` into `createPiRuntimeGatewayFoundation(...)` so prompt shaping uses the public projection boundary.
4. Pass `getProjection` / `updateProjection` into `createPiRuntimeGatewayRuntime(...)` so PI runtime owns snapshot assembly and connect-event shaping.

Low-level snapshot and connect-event helpers may still exist for advanced use, but they are not the primary builder path and they are no longer centered on consumer-owned runtime session internals in the public facade.

## Supporting internal packages

- `agent-runtime-contracts`: runtime-neutral contracts and projection-safe shared helpers.
- `agent-runtime-pi`: Pi gateway implementation and builder-facing runtime factories.
- `agent-runtime-postgres`: Postgres bootstrap, persistence, recovery, and transaction helpers that support the Pi runtime implementation.
