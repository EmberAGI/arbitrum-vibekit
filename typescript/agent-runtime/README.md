# agent-runtime

`agent-runtime` is the builder-facing package for Pi-backed agents.

Normal consumers should treat the package root as the only supported runtime-construction surface. The architectural direction for this package is:

- one blessed top-level builder for normal consumers
- top-level configuration for `model`, `systemPrompt`, and `tools`
- domain extension through declarative `domain` configuration
- no consumer-owned runtime/session/projection assembly

## Public Boundary

The supported normal-consumer path is:

- depend on `agent-runtime`
- import `createAgentRuntime(...)` and domain types from the package root
- configure the runtime declaratively
- `await createAgentRuntime(...)` during process startup to receive the ready runtime `service`
- mount AG-UI from the returned `service.createAgUiHandler(...)` when you need to expose the ready runtime service over HTTP
- use `createAgentRuntimeHttpAgent(...)` from the package root when a web/runtime consumer needs an AG-UI HTTP client
- let `agent-runtime` own runtime assembly and projection assembly

Concrete agent apps should primarily provide:

- domain behavior
- runtime configuration
- app-specific bootstrap/process wiring

Concrete agent apps should not re-implement:

- low-level runtime/service/control-plane assembly
- projection-store ownership
- bootstrap/control-plane/persistence helper orchestration

Concrete agent apps may still consume runtime-agnostic external domain services.
When they do, the concrete app owns the service-specific adapter that translates
between its `domain` hooks and the external protocol. `agent-runtime` must stay
generic: it should not become a service-specific client package or absorb
translation logic for downstream integrations such as the Shared Ember Domain
Service.

Do not treat the package root as a grab bag of helper exports. In particular:

- do not import deprecated workflow helpers as the blessed integration model
- do not expect transport subpaths, control-plane helpers, direct-execution helpers, or Postgres bootstrap helpers
- treat deprecated workflow packages and compatibility seams as debt, not as architectural precedent

## Domain Model

The intended public shape is:

- top-level `model`
- top-level static `systemPrompt`
- top-level `tools`
- `domain` configuration

Normal consumers should not pass public session stores, control-plane loaders, or background automation adapters into the blessed builder. Those concerns are runtime-owned internals.

Persistence/bootstrap ownership follows the same rule:

- if you supply `databaseUrl`, `agent-runtime` treats it as the explicit Postgres override
- if you omit `databaseUrl`, `agent-runtime` boots and uses its default local Postgres configuration internally
- normal consumers do not manually start Postgres, apply schema, or wire persistence helpers around the builder

The `domain` extension surface is responsible for:

- lifecycle declaration
- dynamic system context contribution
- one normalized domain operation handler
- state-driven domain context via `threadId` plus domain state
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

If a domain integration needs to call an external service, the domain/config
layer may delegate to an app-local adapter that returns semantic state,
artifacts, interrupts, and status outputs. `agent-runtime` still owns runtime
projection, transport, and session lifecycle around those outputs.

In particular, domains do not author projection details such as thread patches, AG-UI labels, or artifact-channel routing. Domains return semantic state, artifacts, interrupts, and status updates; `agent-runtime` projects those into runtime/session/transport shapes internally.

The web layer remains projection-only and is not the source of domain truth.

## Internal Package Family

The internal package family still separates:

- `agent-runtime/`: public builder-facing facade package
- `agent-runtime/lib/pi`: Pi runtime and AG-UI transport implementation details
- `agent-runtime/lib/postgres`: persistence, recovery, and bootstrap helpers
- `clients/web-ag-ui/apps/agent-workflow-core`: shared deprecated LangGraph/workflow helpers used only by the older workflow apps

`agent-runtime` no longer depends on any deprecated-workflow-branded package. Those internal/runtime-adjacent packages exist to support the public facade, not to define the normal-consumer integration story.

## Installed Snapshot Sync

`pnpm build` syncs built `dist` artifacts into installed pnpm snapshots so downstream apps can consume local workspace package shapes without a fresh reinstall.

That sync step can be triggered by multiple downstream `build:runtime-deps` commands at once. The snapshot replacement flow now takes a per-target lock directory before removing and copying `dist` so concurrent builds do not leave installed artifacts such as `agent-runtime-pi/dist` or `agent-runtime-postgres/dist` missing.

If a local workspace ever gets into a broken state after an interrupted or older concurrent build, recover it by rebuilding the runtime packages serially:

1. `pnpm --filter agent-runtime-postgres build`
2. `pnpm --filter agent-runtime-pi build`
3. `pnpm --filter agent-runtime build`
