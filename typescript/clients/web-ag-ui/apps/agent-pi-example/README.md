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

In particular, `agent-runtime` now owns:

- session storage and projection assembly
- runtime-scoped automation tools and background polling
- operator-input interruption plumbing
- AG-UI transport wiring and control-plane reads

`agent-pi-example` supplies only domain behavior, model/prompt configuration, and server bootstrap.

## Local Startup

1. Set `OPENROUTER_API_KEY` in `.env` or export it in your shell.
2. Run `pnpm --filter agent-pi-example dev`.

That command:

- builds the shared `agent-runtime` dependency
- loads `.env` automatically, falling back to `.env.example`
- auto-starts the shared local Docker Postgres container when `DATABASE_URL` is not set
- applies the Pi runtime schema before the HTTP server starts
- serves the Pi-backed AG-UI service on `http://127.0.0.1:3410/ag-ui`

If you already have a Postgres instance, set `DATABASE_URL` and the shared bootstrap helper will use it instead of booting local Docker.

## Environment

- `OPENROUTER_API_KEY`: required for live runs
- `PI_AGENT_MODEL`: optional OpenRouter model id, defaults to `openai/gpt-5.4-mini`
- `DATABASE_URL`: optional external Postgres URL
- `PORT`: optional HTTP port, defaults to `3410`
- `E2E_PROFILE=mocked` or `PI_AGENT_EXTERNAL_BOUNDARY_MODE=mocked`: test-only mode that keeps the in-repo Pi runtime, transport, and Postgres stack while replacing only the external LLM boundary

## Testing Practice

Normal validation should keep the in-repo Pi systems real:

- Pi-backed runtime behavior
- AG-UI transport and service boundary
- Postgres-backed persistence, control-plane reads, and automation recovery

Only external boundaries should be mocked or replayed. For the Pi example, that means tests may replace the OpenRouter LLM call, but they should not replace the internal runtime driver with app-owned session, scheduler, or persistence stand-ins.
