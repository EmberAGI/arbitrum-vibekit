# GMX Allora Smoke Tests

## Purpose

Manual smoke checks for Phase 2 execution planning against onchain-actions and Allora.
These replace the old “happy path” e2e test; they are intended to be run explicitly by a developer.

## Environment Variables

- `SMOKE_WALLET`: Wallet address used for listing positions.
- `SMOKE_USDC_ADDRESS`: USDC token address for collateral/pay token. Defaults to Arbitrum USDC
  (`0xaf88d065e77c8cC2239327C5EDb3A432268e5831`) when unset.
- `ONCHAIN_ACTIONS_API_URL`: Optional override (default: `https://api.emberai.xyz`).
- `ALLORA_API_BASE_URL`: Optional override (default uses `resolveAlloraApiBaseUrl`).
- `ALLORA_API_KEY`: Allora API key.

## Run

```bash
pnpm tsx tests/smoke/gmx-allora-smoke.ts
```
