# Sample Workflow Package

This package is the reference implementation that the Agent Node CLI copies when you run `npx @emberai/agent-node init`. It is intentionally self-contained so you can drop it into a mono-repo or publish it as a standalone package.

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

| Command             | Description                                                  |
| ------------------- | ------------------------------------------------------------ |
| `pnpm lint`         | Run ESLint against all TypeScript sources                    |
| `pnpm lint:fix`     | Autofix lint issues                                          |
| `pnpm format`       | Apply Prettier to `src/` and `tests/`                        |
| `pnpm format:check` | Verify formatting without writing                            |
| `pnpm build`        | Type-check and emit compiled workflow artifacts to `dist/`   |
| `pnpm test`         | Run unit, integration, and e2e suites sequentially           |
| `pnpm test:unit`    | Execute `*.unit.test.ts` files under `src/`                  |
| `pnpm test:int`     | Execute Vitest with `.env.test` loaded for integration tests |
| `pnpm test:e2e`     | Serialized Vitest run for e2e specs                          |
| `pnpm test:watch`   | Re-run tests on file changes                                 |
| `pnpm test:ci`      | CI-friendly subset (unit + integration)                      |

## Testing Conventions

- Unit tests live next to the files they cover: `src/**/*.unit.test.ts`
- Integration/e2e tests live in `tests/` and load secrets via Node's native `--env-file` support
- Logs are suppressed during tests by default; set `LOG_LEVEL=debug` to inspect output

## Linting & Formatting

ESLint and Prettier configs live inside this package so you can copy it into any repo without reaching back to the monorepo for shared configs. Update the configs locally if you need additional rules.
