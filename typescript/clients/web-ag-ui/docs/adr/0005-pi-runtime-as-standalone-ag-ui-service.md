# ADR 0005: pi-runtime-as-standalone-ag-ui-service

Status: Accepted
Date: 2026-03-17

## Context

This ADR builds on ADR 0001 and ADR 0003 and narrows how a non-LangGraph runtime should sit behind the AG-UI boundary.

ADR 0001 established AG-UI as the only web-to-agent contract for `web-ag-ui`, but the current concrete runtime integrations remain LangGraph-shaped:
- The CopilotKit route registers LangGraph-backed agents directly.
- Existing long-lived thread/run concerns are coupled to LangGraph-oriented runtime assumptions.
- The new Pi-backed agent must preserve the AG-UI-only web boundary while owning its own sessions, background autonomy, and future non-web adapters.

The Pi-backed agent also needs to continue running without an open browser tab and eventually support other channels such as Telegram. Embedding Pi directly inside the Next.js / CopilotKit process would couple runtime lifecycle, persistence, and scheduling to a web request-serving environment that is not the long-lived runtime-of-record.

This initiative must also be grounded on the actual `pi-mono` package boundaries, not an abstract idea of "Pi":
- `@mariozechner/pi-agent-core` is the foundational stateful agent loop with tool execution, event streaming, and turn/message lifecycle.
- `@mariozechner/pi-ai` is the provider/model/tool-calling substrate beneath that agent core.
- `@mariozechner/pi-web-ui` is not the frontend foundation for this initiative because `web-ag-ui` must remain AG-UI-only.
- `@mariozechner/pi-coding-agent` and `@mariozechner/pi-mom` are useful reference integrations over the Pi core packages, but they are not the direct web runtime boundary for `web-ag-ui`.

## Decision

Adopt Pi as a standalone long-lived gateway-style runtime service exposed through an AG-UI HTTP surface and integrated into `web-ag-ui` through `HttpAgent`.

The architecture rules are:
- The standalone Pi service is built on the real Pi package foundation:
  - `@mariozechner/pi-agent-core` for the stateful agent loop, tool execution, and event stream
  - `@mariozechner/pi-ai` for provider/model/tool-calling infrastructure
- Pi owns canonical thread/session state for Pi-backed agents.
- Pi owns background/autonomous execution for Pi-backed agents.
- Pi acts as the runtime gateway for all Pi-backed client surfaces:
  - AG-UI/web is one adapter
  - future Telegram is another adapter
  - future A2A exposure is another adapter/protocol surface
- `apps/web` and the CopilotKit route continue to treat AG-UI as the only frontend/runtime boundary.
- `@mariozechner/pi-web-ui` is explicitly not adopted as the frontend/runtime boundary for this initiative.
- The CopilotKit route may host multiple runtime backends, but Pi-backed agents are registered through `HttpAgent`, not by embedding Pi runtime logic directly in-process.
- The Pi service boundary must distinguish:
  - model-facing/tool-facing protocol adapters
  - operator/runtime control-plane APIs for scheduler health, replay/recreate, inspection, and maintenance
- Pi-specific concepts must not leak into React hooks, reducers, or detail-page rendering contracts.
- The web layer must preserve ADR 0003's `ThreadState -> UiState -> View` boundary:
  - Pi/agent domain emits `ThreadState`
  - web derives `UiState`
  - React views consume only `UiState`
- Pi reconnect and attach flows must replay transcript state from Pi-owned thread/session state:
  - chat history belongs to Pi, not to web-local fallback state
  - Pi-backed AG-UI replay surfaces must include enough transcript state for web rehydration, including thread-state message history and AG-UI message snapshots when available
- Pi attach flows are long-lived runtime responsibilities, not React polling responsibilities:
  - Pi `connect` must emit an initial synthetic snapshot run for the open thread and then continue surfacing later Pi-owned background changes on that same attach stream
  - background automation executions must be projected as AG-UI-visible run activity from Pi-owned state
  - web must keep at most one active `connect` for the currently open agent/thread and must not add redundant reconnect polling to simulate runtime updates
- React views and page-level UI composition must not enforce agent business rules or agent-side invariants.
- Web-side logic is limited to projection/view-model responsibilities such as authority selection, stale-event rejection, ordering guards, and local transient UI state.
- Web must not preserve or invent durable transcript history locally to compensate for incomplete Pi snapshots; if reconnect replay is wrong, the fix belongs in Pi-owned state and projection.

## Rationale

- Preserves ADR 0001 by keeping the web boundary protocol-facing rather than runtime-facing.
- Preserves ADR 0003 by keeping the web boundary projection-only rather than domain-owning.
- Lets Pi remain the runtime-of-record for session persistence, background jobs, and future client adapters.
- Lets Pi behave like a gateway/runtime-of-record rather than a web-embedded worker.
- Prevents reconnect drift where web appears stable only because it is preserving transcript state that Pi failed to replay.
- Reduces coupling between web deployment concerns and long-lived runtime concerns.
- Makes it possible to reuse the same Pi runtime for Telegram and future protocols without forcing those clients through web-specific assumptions.
- Uses the existing AG-UI client contract instead of inventing a parallel adapter stack that mimics LangGraph.
- Keeps the initiative anchored on the real Pi packages we already have instead of inventing a parallel "Pi runtime" concept detached from `pi-mono`.

## Alternatives Considered

- Embed Pi directly into the Next.js / CopilotKit process via a custom `AbstractAgent` implementation:
  - Rejected because it couples long-lived runtime ownership to the web process and weakens future multi-client reuse.
- Build a new LangGraph-like runtime shell around Pi inside `web-ag-ui`:
  - Rejected because it would duplicate runtime responsibilities and reintroduce LangGraph-shaped assumptions the new agent does not need.
- Make the web frontend Pi-aware and bypass AG-UI for Pi-backed agents:
  - Rejected because it would violate ADR 0001 and fragment the frontend contract.
- Use `@mariozechner/pi-web-ui` as the direct frontend/runtime foundation for this initiative:
  - Rejected because `web-ag-ui` must remain AG-UI-only; `pi-web-ui` may still be a reference implementation for UI/event-handling ideas.

## Consequences

- Positive:
  - Clear runtime ownership for sessions and background autonomy.
  - Cleaner gateway model for multi-client evolution.
  - Clean reuse path for future non-web clients.
  - Lower risk of frontend/runtime coupling regressions.
- Tradeoffs:
  - Requires a standalone Pi AG-UI service and network boundary between web and Pi.
  - Requires an explicit split between model-facing protocol APIs and operator/runtime control APIs.
  - Adds integration work around AG-UI HTTP registration and local/dev deployment.
- Follow-on work:
  - Implement the Pi AG-UI HTTP surface.
  - Define the operator/runtime control-plane surface separately from model-facing tools.
  - Register Pi-backed agents through `HttpAgent` in the CopilotKit route.
  - Add integration tests that validate AG-UI behavior against the Pi service boundary.
