# GMX Allora Smoke Tests

## Purpose

Manual smoke checks for Phase 2 execution planning against onchain-actions and Allora.
These replace the old “happy path” e2e test; they are intended to be run explicitly by a developer.

## Environment Variables

- `SMOKE_WALLET`: Delegator wallet address used for listing positions / planning.
- `SMOKE_USDC_ADDRESS`: USDC token address for collateral/pay token. Defaults to Arbitrum USDC
  (`0xaf88d065e77c8cC2239327C5EDb3A432268e5831`) when unset.
- `ONCHAIN_ACTIONS_API_URL`: Optional override (default: `https://api.emberai.xyz`).
- `ALLORA_API_BASE_URL`: Optional override (default uses `resolveAlloraApiBaseUrl`).
- `ALLORA_API_KEY`: Allora API key.
- `DELEGATIONS_BYPASS`: When `true`, smoke execution uses the agent wallet directly (no delegations).
- `GMX_ALLORA_TX_SUBMISSION_MODE`: `plan` (default) or `execute` (broadcast).
- `A2A_TEST_AGENT_NODE_PRIVATE_KEY`: Required when `GMX_ALLORA_TX_SUBMISSION_MODE=execute`.
- `SMOKE_DELEGATOR_PRIVATE_KEY`: Required when `DELEGATIONS_BYPASS=false` and `GMX_ALLORA_TX_SUBMISSION_MODE=execute`.

## Run

```bash
pnpm test:smoke
```
