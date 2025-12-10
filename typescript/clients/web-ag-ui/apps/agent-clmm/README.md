# Agent CLMM Package

Internal reference package for the CLMM agent workflow. Mirrors the Camelot workflow scaffold so the project can lint, format, build, and run Vitest suites in isolation.

## Prerequisites

- Node.js >= 22
- pnpm >= 10.7
- Copy `.env.example` to `.env` and fill in provider keys
- Copy `.env.test` if you need isolated credentials for integration/e2e suites

## Install

```bash
pnpm install
```

## Available Scripts

| Command              | Description                                                     |
| -------------------- | --------------------------------------------------------------- |
| `pnpm lint`          | Run ESLint against all TypeScript sources                       |
| `pnpm lint:fix`      | Autofix lint issues                                             |
| `pnpm format`        | Apply Prettier to `src/` and `tests/`                           |
| `pnpm format:check`  | Verify formatting without writing                               |
| `pnpm build`         | Type-check and emit compiled artifacts to `dist/`               |
| `pnpm test`          | Run unit, integration, and e2e suites sequentially              |
| `pnpm test:unit`     | Execute `*.unit.test.ts` files                                  |
| `pnpm test:int`      | Execute Vitest with `.env.test` loaded for integration tests    |
| `pnpm test:e2e`      | Serialized Vitest run for e2e specs                             |
| `pnpm test:watch`    | Re-run tests on file changes                                    |
| `pnpm test:ci`       | CI-friendly subset (unit + integration)                         |
| `pnpm workflow:demo` | Streams the Camelot CLMM workflow locally using live Ember data |

## Testing Conventions

- Unit tests live next to the files they cover: `src/**/*.unit.test.ts` and `tests/**/*.unit.test.ts`
- Integration/e2e tests live in `tests/` and load secrets via Node's native `--env-file` support
- Logs are suppressed during tests by default; set `LOG_LEVEL=debug` to inspect output

## Camelot Workflow Demo

Use the demo runner to execute the Camelot CLMM workflow without a front end:

```bash
CLMM_DEMO_POOL_ADDRESS=0x... \
CLMM_DEMO_WALLET_ADDRESS=0x... \
DEBUG_MODE=true \
pnpm workflow:demo -- --contribution=7500
```

The script reads pool/wallet/contribution from CLI flags or the corresponding `CLMM_DEMO_*` env vars, feeds them into the real workflow, and prints every status update/artifact as it interacts with live Ember APIs. Set `DEBUG_MODE=true` to keep transaction signing in dry-run mode; clear it when you want to execute the planned transactions for real.

> **Important:** Live transactions are signed directly by the EOA derived from `A2A_TEST_AGENT_NODE_PRIVATE_KEY` (logged as `agentWalletAddress`). Make sure the wallet you supply via CLI/env matches that private key, because the workflow can only approve liquidity or unwind positions for the address it controls.
