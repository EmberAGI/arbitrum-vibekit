# Liquidity Delegation Demo (Camelot CLMM / Arbitrum)

This demo:

1. Fetches Ember-generated Camelot CLMM transactions (supply or withdraw), **or** reads them from a JSON file
2. Generates **least-privilege function-call delegations** by deriving 4-byte selectors from calldata
3. Optionally broadcasts a `DelegationManager.redeemDelegations(...)` tx that executes the Ember txs

## Quickstart

```bash
cd typescript/clients/web-ag-ui/apps/agent-clmm/demo/liquidity
cp .env.example .env
pnpm dev
```

## Inputs

You can provide transactions in one of three ways:

- `DEMO_TX_FILE` / `--tx-file`: path to a JSON file containing either:
  - an array of `{ type: "EVM_TX", to, data, value, chainId }`, or
  - `{ "transactions": [ ... ] }`
- `EMBER_SUPPLY_REQUEST_FILE` / `--ember-supply-request-file`: path to a JSON file matching Ember `/liquidity/supply`
- `EMBER_WITHDRAW_REQUEST_FILE` / `--ember-withdraw-request-file`: path to a JSON file matching Ember `/liquidity/withdraw`

Template request files are included:

- `supply-request.example.json` (WBTC–WETH V3 pool on Arbitrum: `0xd845f7D4f4DeB9Ff5bCf09D140Ef13718F6f6C71`)
- `withdraw-request.example.json` (same pool identifier)

The supply template uses a **concentrated** (`limited`) range around the current pool price at the time it was generated (±1% around ~`29.6009` from Ember’s pool list).

## Identities

- **Delegator** (user) signs the delegation objects:
  - `DEMO_DELEGATOR_PRIVATE_KEY`
- **Delegatee** (agent) broadcasts the redeem+execute transaction (only needed if `DEMO_EXECUTE=true`):
  - `DEMO_DELEGATEE_PRIVATE_KEY`
  - `DEMO_DELEGATEE_ADDRESS` (must match the private key’s address)

## Execution (optional)

To actually run the Ember tx sequence onchain, set:

- `DEMO_EXECUTE=true`
- `DEMO_RPC_URL=<arbitrum rpc>`

The demo will then send a transaction from the delegatee account that calls `DelegationManager.redeemDelegations(...)` and executes the Ember-generated calls.

## Safety switches

- `DEMO_DELEGATION_TARGET_ALLOWLIST=0x...,0x...` to restrict which targets can be delegated
- `DEMO_ALLOW_NONZERO_VALUE=true` to allow value-bearing txs (default: reject)
- `DEMO_ALLOW_EMPTY_CALLDATA=true` to allow `data: "0x"` (default: reject)

## Notes on request templates

- Token UIDs in `supply-request.example.json` are:
  - WBTC (Arbitrum): `0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f` (8 decimals)
  - WETH (Arbitrum): `0x82af49447d8a07e3bd95bd0d56f35241523fbab1` (18 decimals)
- Amounts are raw token units (integer strings). Adjust them to match your demo wallet balances.
