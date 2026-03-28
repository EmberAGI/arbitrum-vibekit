# agent-runtime

`agent-runtime` is the builder-facing package for Pi-backed agents.

Normal consumers should treat the package root as the only supported integration surface. The architectural direction for this package is:

- one blessed top-level builder for normal consumers
- top-level configuration for `model`, `systemPrompt`, and `tools`
- domain extension through declarative `domain` configuration
- no consumer-owned runtime/session/projection/AG-UI assembly

## Public Boundary

The supported normal-consumer path is:

- depend on `agent-runtime`
- import from the package root
- configure the runtime declaratively
- let `agent-runtime` own runtime assembly, AG-UI transport integration, and projection assembly

Concrete agent apps should primarily provide:

- domain behavior
- runtime configuration
- app-specific bootstrap/process wiring

Concrete agent apps should not re-implement:

- low-level runtime/service/control-plane assembly
- projection-store ownership
- generic AG-UI transport glue

## Domain Model

The intended public shape is:

- top-level `model`
- top-level static `systemPrompt`
- top-level `tools`
- `domain` configuration

Normal consumers should not pass public session stores, control-plane loaders, or background automation adapters into the blessed builder. Those concerns are runtime-owned internals.

The `domain` extension surface is responsible for:

- lifecycle declaration
- dynamic system context contribution
- one normalized domain operation handler
- adapter-neutral domain outputs

The domain owns:

- business lifecycle vocabulary and policy
- commands
- interrupts
- domain state

`agent-runtime` owns:

- runtime loop ownership
- session storage and execution persistence
- runtime-scoped automation tools and background work
- operator-input interruption plumbing
- transport ownership
- projection assembly
- structural contract enforcement

The web layer remains projection-only and is not the source of domain truth.

## Internal Package Family

The internal package family still separates:

- `agent-runtime/`: public builder-facing facade package
- `agent-runtime/lib/contracts`: runtime-neutral contracts and shared invariants
- `agent-runtime/lib/pi`: Pi runtime and AG-UI transport implementation details
- `agent-runtime/lib/postgres`: persistence, recovery, and bootstrap helpers

Those internal packages exist to support the public facade. They are not the normal-consumer integration story.

## Installed Snapshot Sync

`pnpm build` syncs built `dist` artifacts into installed pnpm snapshots so downstream apps can consume local workspace package shapes without a fresh reinstall.

That sync step can be triggered by multiple downstream `build:runtime-deps` commands at once, such as `apps/web` and `apps/agent-ember-lending` starting in parallel. The snapshot replacement flow now takes a per-target lock directory before removing and copying `dist` so concurrent builds do not leave installed artifacts such as `agent-runtime-contracts/dist` missing.

If a local workspace ever gets into a broken state after an interrupted or older concurrent build, recover it by rebuilding the runtime packages serially:

1. `pnpm --filter agent-runtime-contracts build`
2. `pnpm --filter agent-runtime build`
