# GMX Allora Smoke Tests

## Purpose

Manual smoke checks for Phase 2 execution planning against onchain-actions and Allora.

## Environment Variables

- `SMOKE_WALLET`: Wallet address used for listing positions.
- `SMOKE_USDC_ADDRESS`: USDC token address for collateral/pay token.
- `ONCHAIN_ACTIONS_API_URL`: Optional override (default: `https://api.emberai.xyz`).
- `ALLORA_API_BASE_URL`: Optional override (default uses `resolveAlloraApiBaseUrl`).
- `ALLORA_API_KEY`: Allora API key.

## Run

```bash
pnpm tsx tests/smoke/gmx-allora-smoke.ts
```
