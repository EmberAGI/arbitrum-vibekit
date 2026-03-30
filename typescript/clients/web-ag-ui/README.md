# web-ag-ui

`web-ag-ui` is the multi-agent client/runtime workspace for EmberAGI.

It includes:

- `apps/web`: the Next.js frontend that talks to agents only through the AG-UI/CopilotKit boundary
- `apps/agent-pi-example`: the Pi-backed golden-example runtime target
- additional `apps/agent-*` runtimes for concrete agent families
- shared architecture docs and ADRs for AG-UI, Pi runtime, and domain-module boundaries

## Current Architecture Direction

- AG-UI is the only web-to-agent protocol boundary.
- `apps/web` stays projection-only and must not become the source of domain truth.
- The `agent-runtime` package family owns reusable Pi AG-UI transport behavior.
- Concrete agent apps should primarily contribute domain behavior, runtime configuration, and app-specific bootstrap.
- When a concrete agent app consumes a runtime-agnostic upstream domain service, the app owns the thin adapter between `agent-runtime` domain hooks and that external service protocol.
- Neither `apps/web` nor `agent-runtime` should absorb service-specific translation logic for downstream domain integrations such as the Shared Ember Domain Service.
- Agent-family lifecycle behavior belongs in pluggable domain modules above the Pi core runtime.

## Workspace Notes

- Use app-specific READMEs for local startup details.
- Use the docs in `docs/` and `docs/adr/` for the authoritative architecture direction.
- Treat older LangGraph starter language as historical context, not the current architecture contract.

## Key Docs

- [C4 Target Architecture: web-ag-ui + Agents (AG-UI-only)](./docs/c4-target-architecture-web-ag-ui-agents.md)
- [C4 Target Architecture: Pi Runtime + AG-UI + Automations](./docs/c4-pi-runtime-architecture-and-boundaries.md)
- [AG-UI Client Runtime Invariants](./docs/ag-ui-client-runtime-invariants.md)
- [AG-UI Frontend/Backend Contract for UI Stability](./docs/ag-ui-frontend-backend-contract-ui-stability.md)
- [ADR 0011: blessed-agent-runtime-factory-and-runtime-owned-projection-assembly](./docs/adr/0011-blessed-agent-runtime-factory-and-runtime-owned-projection-assembly.md)
- [ADR 0010: pluggable-agent-domain-modules-above-pi-core-runtime](./docs/adr/0010-pluggable-agent-domain-modules-above-pi-core-runtime.md) (superseded lineage)
