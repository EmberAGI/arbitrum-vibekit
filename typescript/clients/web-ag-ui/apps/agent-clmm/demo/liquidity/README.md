# Liquidity Delegation Demo (Camelot CLMM / Arbitrum)

This demo:

1. Fetches Ember-generated transactions (supply / withdraw / swap), **and/or** reads them from JSON file(s)
2. Expands supported multicall-style txs into underlying calls (fail-closed on unsupported multicall variants)
3. Generates **least-privilege function-call delegations** by deriving per-target 4-byte selectors from calldata, plus byte-level calldata pinning for safety-critical fields (spender, recipients, token pairs)
4. Optionally broadcasts a `DelegationManager.redeemDelegations(...)` tx that executes the expanded calls atomically (batch mode)

## Quickstart

```bash
cd typescript/clients/web-ag-ui/apps/agent-clmm/demo/liquidity
cp .env.example .env
pnpm dev
```

## Inputs

Recommended: provide a single **intent config** and let the demo fetch a representative set of tx plans from Ember.

Inputs:

- `DEMO_INTENT_FILE` / `--intent-file`: path to a JSON file containing pool + position sizing + which plans to include (supply/withdraw/swap). See `intent.example.json`.
- (Optional, debug) `DEMO_TX_FILE` / `--tx-file`: comma-separated list of prebuilt tx plan JSON files, each containing either:
  - an array of `{ type: "EVM_TX", to, data, value, chainId }`, or
  - `{ "transactions": [ ... ] }`

Template intent files are included:

- `intent.example.json` (WBTC–WETH V3 pool on Arbitrum: `0xd845f7D4f4DeB9Ff5bCf09D140Ef13718F6f6C71`)

## Identities

- **Delegator** (user) signs the delegation objects:
  - `DEMO_DELEGATOR_PRIVATE_KEY`
- **Delegatee** (agent) broadcasts the redeem+execute transaction (only needed if `DEMO_EXECUTE=true`):
  - `DEMO_DELEGATEE_PRIVATE_KEY`
  - `DEMO_DELEGATEE_ADDRESS` (must match the private key’s address)

## Execution (optional)

To actually run the derived tx plan onchain, set:

- `DEMO_EXECUTE=true`
- `DEMO_RPC_URL=<arbitrum rpc>`

The demo will then send one transaction per **intent action** (plus any `--tx-file` inputs), each calling `DelegationManager.redeemDelegations(...)` and executing that action’s expanded calls atomically (batch mode).

Ordering: execution follows the order of the `actions` array in your intent file, then any `--tx-file` inputs.

## Simulation (optional, no onchain tx)

To validate that your delegation bundle stays usable across multiple planning cycles (without broadcasting anything), set:

- `DEMO_SIMULATE=true`
- `DEMO_SIMULATE_CYCLES=5` (default)

This re-requests plans from Ember over multiple cycles and verifies that every expanded call is authorized by the delegation intents. Note: even with `DEMO_SIMULATE=false`, the demo still calls Ember once per intent action when `DEMO_INTENT_FILE` is set (simulation just adds the multi-cycle loop).

## Safety switches

- `DEMO_DELEGATION_TARGET_ALLOWLIST=0x...,0x...` to restrict which targets can be delegated
- `DEMO_ALLOW_NONZERO_VALUE=true` to allow value-bearing txs (default: reject)
- `DEMO_ALLOW_EMPTY_CALLDATA=true` to allow `data: "0x"` (default: reject)
- `DEMO_ENFORCE_TOKEN_ALLOWLIST=true` (default) to reject swaps unless tokenIn/tokenOut are within the intent token pair
- `DEMO_SPEND_CAP_MULTIPLIER=6` (default) to set per-hour ERC-20 spend caps derived from `intent.payableTokens` via `erc20PeriodTransfer`

## Notes on request templates

- Token UIDs in `intent.example.json` are:
  - WBTC (Arbitrum): `0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f` (8 decimals)
  - WETH (Arbitrum): `0x82af49447d8a07e3bd95bd0d56f35241523fbab1` (18 decimals)
- Amounts are raw token units (integer strings). Adjust them to match your demo wallet balances.
