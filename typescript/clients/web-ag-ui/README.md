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
- Local managed-agent QA should be started with durable Postgres persistence for
  both runtime layers:
  - `agent-portfolio-manager` and `agent-ember-lending` already use
    `DATABASE_URL` for `pi_runtime`
  - Shared Ember must also be started with
    `SHARED_EMBER_PROTOCOL_REFERENCE_BOOTSTRAP_JSON` carrying a postgres
    persistence block for the `ember` database
  - do not rely on the repo-local Shared Ember harness's in-memory fallback for
    multi-step QA, because service identities, onboarding state, and other
    Shared Ember truth will be lost on restart
- Use `pnpm smoke:managed-identities` to prove the current downstream Shared Ember + OWS-facing identity boundary:
  - `portfolio-manager` / `orchestrator` is non-null
  - `ember-lending` / `subagent` is non-null
  - post-bootstrap `subagent.readExecutionContext.v1` exposes a non-null `subagent_wallet_address`
- Use `RUN_SHARED_EMBER_INT=1 EMBER_ORCHESTRATION_V1_SPEC_ROOT=<private-repo-root> pnpm --filter agent-ember-lending test:int -- src/sharedEmberAdapter.int.test.ts`
  to prove the real runtime-owned redelegation typed-data signing seam against
  the repo-backed Shared Ember harness.
- `compose.managed.yaml` layers in:
  - `shared-ember`
  - `agent-portfolio-manager`
  - `agent-ember-lending`
  - `pi-runtime-postgres`
- the base `compose.yaml` now mounts named Docker volumes for each existing
  LangGraph agent's `.langgraph_api` state:
  - `agent_langgraph_api`
  - `agent_clmm_langgraph_api`
  - `agent_pendle_langgraph_api`
  - `agent_gmx_allora_langgraph_api`
- this makes the LangGraph runtime state durable across container recreation;
  live migration can restore the existing `.langgraph_api` tar backups into
  those named volumes during deploy
- The managed compose overlay expects `SHARED_EMBER_REPO_ROOT` to point at an
  `ember-orchestration-v1-spec` checkout because the `shared-ember` image boots
  the Shared Ember HTTP service through Vibekit's managed harness while loading
  the domain-service implementation from that external repo.
- The managed compose overlay also provisions an explicit
  `pi-runtime-postgres` service and injects `DATABASE_URL` into the managed
  agent containers so they do not rely on the runtime's host-process Docker
  bootstrap path from inside Docker.
- Manual local service bring-up should mirror that durability contract for
  Shared Ember as well. Example from `typescript/clients/web-ag-ui/`:

```bash
EMBER_ORCHESTRATION_V1_SPEC_ROOT=/abs/path/to/ember-orchestration-v1-spec \
SHARED_EMBER_HOST=127.0.0.1 \
SHARED_EMBER_PORT=4010 \
SHARED_EMBER_MANAGED_AGENT_ID=ember-lending \
SHARED_EMBER_ONCHAIN_ACTIONS_PLANNER_AGENT_IDS=ember-lending \
SHARED_EMBER_PROTOCOL_REFERENCE_BOOTSTRAP_JSON='{"persistence":{"kind":"postgres","connectionString":"postgresql://ember:ember@127.0.0.1:55433/ember"}}' \
PORTFOLIO_MANAGER_OWS_VAULT_PATH=/abs/path/to/ows/portfolio-manager \
EMBER_LENDING_OWS_VAULT_PATH=/abs/path/to/ows/ember-lending \
./apps/agent-portfolio-manager/node_modules/.bin/tsx ./scripts/smoke/start-managed-shared-ember.ts
```

- That startup contract is the default expectation for local QA. Use the
  in-memory Shared Ember fallback only for intentionally short-lived smoke
  isolation.
- The managed compose overlay also mounts the OWS vault directories read-only
  into the managed containers. By default it expects host paths:
  - `/opt/web-ag-ui/runtime/ows/portfolio-manager`
  - `/opt/web-ag-ui/runtime/ows/ember-lending`
  and the managed agent env files should point `*_OWS_VAULT_PATH` at the
  mounted in-container paths under `/runtime/ows/...`.
- Example:
  - `SHARED_EMBER_REPO_ROOT=/abs/path/to/ember-orchestration-v1-spec docker compose -f compose.yaml -f compose.managed.yaml config`

## Key Docs

- [C4 Target Architecture: web-ag-ui + Agents (AG-UI-only)](./docs/c4-target-architecture-web-ag-ui-agents.md)
- [C4 Target Architecture: Pi Runtime + AG-UI + Automations](./docs/c4-pi-runtime-architecture-and-boundaries.md)
- [AG-UI Client Runtime Invariants](./docs/ag-ui-client-runtime-invariants.md)
- [AG-UI Frontend/Backend Contract for UI Stability](./docs/ag-ui-frontend-backend-contract-ui-stability.md)
- [ADR 0014: fail-closed-service-identity-preflight-for-managed-shared-ember-agents](./docs/adr/0014-fail-closed-service-identity-preflight-for-managed-shared-ember-agents.md)
- [ADR 0011: blessed-agent-runtime-factory-and-runtime-owned-projection-assembly](./docs/adr/0011-blessed-agent-runtime-factory-and-runtime-owned-projection-assembly.md)
- [ADR 0010: pluggable-agent-domain-modules-above-pi-core-runtime](./docs/adr/0010-pluggable-agent-domain-modules-above-pi-core-runtime.md) (superseded lineage)
