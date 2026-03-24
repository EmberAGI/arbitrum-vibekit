# Pi Example Agent

`agent-pi-example` is the Pi-native local smoke target for the web runtime stack. It now runs a real `@mariozechner/pi-agent-core` / `@mariozechner/pi-ai` loop through the shared `agent-runtime` gateway foundation, persists runtime state in Postgres, and exposes the real AG-UI plus control-plane HTTP surfaces.

## Local Startup

1. Set `OPENROUTER_API_KEY` in `.env` or export it in your shell.
2. Run `pnpm --filter agent-pi-example dev`.

That single command now does all of the local runtime setup that belongs to this app:

- builds the shared `agent-runtime` dependency
- loads `.env` automatically, falling back to `.env.example`
- auto-starts the shared local Docker Postgres container when `DATABASE_URL` is not set
- applies the Pi runtime schema before the HTTP server starts
- serves the Pi-native gateway on `http://127.0.0.1:3410/ag-ui`

If you already have a Postgres instance, set `DATABASE_URL` and the shared bootstrap helper will use it instead of booting local Docker.

## Environment

- `OPENROUTER_API_KEY`: required for live runs
- `PI_AGENT_MODEL`: optional OpenRouter model id, defaults to `openai/gpt-5.4-mini`
- `DATABASE_URL`: optional external Postgres URL
- `PORT`: optional HTTP port, defaults to `3410`
- `E2E_PROFILE=mocked` or `PI_AGENT_EXTERNAL_BOUNDARY_MODE=mocked`: test-only mode that keeps the real in-repo Pi runtime, transport, and Postgres stack while replacing only the external LLM boundary

## Testing Practice

Normal validation should keep the in-repo Pi systems real:

- Pi runtime gateway foundation
- AG-UI transport and service boundary
- Postgres-backed persistence and control-plane reads

Only external boundaries should be mocked or replayed. For the Pi example, that means tests may replace the OpenRouter LLM call, but they should not replace the internal Pi runtime, service, or persistence layers with synthetic stand-ins.
