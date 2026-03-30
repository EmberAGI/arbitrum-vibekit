# Pi Example Agent

`agent-pi-example` is the Pi-native local smoke target for the web runtime stack and the reference app for the blessed `agent-runtime` integration path.

Its architectural job is to stay extremely simple while still exercising the core `agent-runtime` feature set:

- a real Pi-backed agent loop
- declarative runtime configuration
- tool execution
- domain lifecycle behavior
- interrupts
- AG-UI transport behavior
- Postgres-backed runtime state

The intended lifecycle example for this app is:

- `prehire -> onboarding -> hired -> fired`

This app is the intended reference path: it should configure `agent-runtime`, not assemble low-level runtime internals itself.

The intended split is:

- `agent-runtime` package root for the blessed runtime builder and AG-UI HTTP client factory
- the returned runtime `service.createAgUiHandler(...)` for AG-UI mounting

In particular, `agent-runtime` now owns:

- session storage and projection assembly
- runtime-scoped automation tools and background polling
- operator-input interruption plumbing
- AG-UI transport wiring and control-plane reads

`agent-pi-example` supplies only domain behavior, model/prompt configuration, and server bootstrap.

Its domain module now uses the blessed state-driven contract:

- `systemContext({ threadId, state })`
- `handleOperation({ threadId, state, operation })`
- semantic outputs for status, artifacts, and interrupts only

The example does not author thread patches, AG-UI label text, or projection-channel details directly.

## Reference Boundary Rules

`agent-pi-example` is the positive example for the blessed `agent-runtime`
builder path, but some of its surrounding web/test affordances are
example-specific and should not be copied blindly into other downstream apps.

- The example app shows how a concrete app configures `agent-runtime`; it is
  not a precedent for embedding external service-specific translation logic in
  `apps/web` or in `agent-runtime` itself.
- Downstream apps that consume runtime-agnostic upstream services should keep
  that translation in an app-local adapter beside their own domain config.
- The anonymous-thread allowance used by the Pi example in web surfaces is an
  example-specific smoke-test affordance, not a general rule for wallet-backed
  downstream agent apps.

## Local Startup

1. Set `OPENROUTER_API_KEY` in `.env` or export it in your shell.
2. Run `pnpm --filter agent-pi-example dev`.

That command:

- builds the shared `agent-runtime` dependency
- loads `.env` automatically, falling back to `.env.example`
- serves the Pi-backed AG-UI service on `http://127.0.0.1:3410/ag-ui`

If you set `DATABASE_URL`, the runtime uses that Postgres instance as the explicit override. If you omit it, `agent-runtime` boots and uses its default local Postgres setup automatically.

## Environment

- `OPENROUTER_API_KEY`: required for live runs
- `PI_AGENT_MODEL`: optional OpenRouter model id, defaults to `openai/gpt-5.4-mini`
- `DATABASE_URL`: optional Postgres URL override; when omitted, runtime-managed default Postgres bootstrap is used
- `PORT`: optional HTTP port, defaults to `3410`
- `E2E_PROFILE=mocked` or `PI_AGENT_EXTERNAL_BOUNDARY_MODE=mocked`: test-only mode that keeps the in-repo Pi runtime, transport, and Postgres stack while replacing only the external LLM boundary

## Testing Practice

Normal validation should keep the in-repo Pi systems real:

- Pi-backed runtime behavior
- AG-UI transport and service boundary
- Postgres-backed persistence, control-plane reads, and automation recovery through either the runtime-managed default Postgres path or an explicit `DATABASE_URL` override

Only external boundaries should be mocked or replayed. For the Pi example, that means tests may replace the OpenRouter LLM call, but they should not replace the internal runtime driver with app-owned session, scheduler, or persistence stand-ins.
