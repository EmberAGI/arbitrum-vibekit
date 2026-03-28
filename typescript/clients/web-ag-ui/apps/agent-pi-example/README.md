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

- `agent-runtime` package root for the blessed runtime builder
- `agent-runtime/pi-transport` for AG-UI transport mounting only

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

## Local Startup

1. Set `OPENROUTER_API_KEY` in `.env` or export it in your shell.
2. Run `pnpm --filter agent-pi-example dev`.

That command:

- builds the shared `agent-runtime` dependency
- loads `.env` automatically, falling back to `.env.example`
- serves the Pi-backed AG-UI service on `http://127.0.0.1:3410/ag-ui`

If you set `DATABASE_URL`, the runtime persists state in Postgres. If you omit it, the example still runs, but it uses in-memory runtime state for that process only.

## Environment

- `OPENROUTER_API_KEY`: required for live runs
- `PI_AGENT_MODEL`: optional OpenRouter model id, defaults to `openai/gpt-5.4-mini`
- `DATABASE_URL`: optional Postgres URL for persisted runtime state
- `PORT`: optional HTTP port, defaults to `3410`
- `E2E_PROFILE=mocked` or `PI_AGENT_EXTERNAL_BOUNDARY_MODE=mocked`: test-only mode that keeps the in-repo Pi runtime, transport, and Postgres stack while replacing only the external LLM boundary

## Testing Practice

Normal validation should keep the in-repo Pi systems real:

- Pi-backed runtime behavior
- AG-UI transport and service boundary
- Postgres-backed persistence, control-plane reads, and automation recovery when `DATABASE_URL` is configured

Only external boundaries should be mocked or replayed. For the Pi example, that means tests may replace the OpenRouter LLM call, but they should not replace the internal runtime driver with app-owned session, scheduler, or persistence stand-ins.
