# web-ag-ui

`web-ag-ui` is the multi-agent client/runtime workspace for EmberAGI.

It includes:

- `apps/web`: the Next.js frontend that talks to agents only through the AG-UI/CopilotKit boundary
- `apps/agent-pi-example`: the Pi-backed golden-example runtime target
- `apps/agent-portfolio-manager`: the managed-agent controller for Shared Ember onboarding, reservation, and activation flows
- `apps/agent-ember-lending`: the first concrete managed subagent consuming the bounded Shared Ember subagent surface
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
- The first concrete managed downstream path is `agent-portfolio-manager` -> `agent-ember-lending` -> Shared Ember Domain Service:
  - Portfolio Manager owns managed onboarding, mandate approval, reservation creation, activation, and deactivation.
  - Ember Lending owns the bounded managed-subagent surface for portfolio-state reads, candidate-plan materialization, transaction execution, and escalation requests.

## Workspace Notes

- Use app-specific READMEs for local startup details.
- Use the docs in `docs/` and `docs/adr/` for the authoritative architecture direction.
- Treat older LangGraph starter language as historical context, not the current architecture contract.
- Use `pnpm smoke:managed-identities` to prove the current downstream Shared Ember + OWS-facing identity boundary:
  - `portfolio-manager` / `orchestrator` is non-null
  - `ember-lending` / `subagent` is non-null
  - post-bootstrap `subagent.readExecutionContext.v1` exposes a non-null `subagent_wallet_address`

## Key Docs

- [C4 Target Architecture: web-ag-ui + Agents (AG-UI-only)](./docs/c4-target-architecture-web-ag-ui-agents.md)
- [C4 Target Architecture: Pi Runtime + AG-UI + Automations](./docs/c4-pi-runtime-architecture-and-boundaries.md)
- [AG-UI Client Runtime Invariants](./docs/ag-ui-client-runtime-invariants.md)
- [AG-UI Frontend/Backend Contract for UI Stability](./docs/ag-ui-frontend-backend-contract-ui-stability.md)
- [ADR 0014: fail-closed-service-identity-preflight-for-managed-shared-ember-agents](./docs/adr/0014-fail-closed-service-identity-preflight-for-managed-shared-ember-agents.md)
- [ADR 0011: blessed-agent-runtime-factory-and-runtime-owned-projection-assembly](./docs/adr/0011-blessed-agent-runtime-factory-and-runtime-owned-projection-assembly.md)
- [ADR 0010: pluggable-agent-domain-modules-above-pi-core-runtime](./docs/adr/0010-pluggable-agent-domain-modules-above-pi-core-runtime.md) (superseded lineage)
