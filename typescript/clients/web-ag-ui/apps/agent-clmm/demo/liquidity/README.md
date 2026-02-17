# Liquidity Delegation Demo (Camelot CLMM / Arbitrum)

This demo:

1. Fetches Ember-generated transactions (supply / withdraw / swap), **and/or** reads them from JSON file(s)
2. Expands supported multicall-style txs into underlying calls (fail-closed on unsupported multicall variants)
3. Generates **least-privilege function-call delegations** by deriving per-target 4-byte selectors from calldata, plus byte-level calldata pinning for safety-critical fields (spender, recipients, token pairs)
4. Optionally broadcasts a `DelegationManager.redeemDelegations(...)` tx that executes the expanded calls atomically (batch mode)

## Important limitations (read before executing)

This demo is intentionally conservative in what it can *enforce onchain* via MetaMask Delegation Toolkit caveats.

### Spend caps (period rate limits)

The demo can derive “Spending caps” from `intent.payableTokens`, but **those caps are only enforceable onchain for direct token-movement calls**:

- ✅ Enforceable: `ERC20.transfer(...)` / `ERC20.transferFrom(...)` (and native token sends) when those are the *executed calls*.
- ❌ Not enforceable (by the built-in period-transfer enforcers): router swaps, `approve(...)`, and Liquidity Manager `mint`/rebalance-style methods, because token movement happens *inside* those contracts.

As a result:

- Swap flows (`approve` + Uniswap V3 `exactInputSingle`) will **not** be rate-limited by `erc20PeriodTransfer` caveats.
- Liquidity mint/rebalance flows will **not** be rate-limited by `erc20PeriodTransfer` caveats.

### What is enforced for swaps

For swaps, safety comes from *calldata-level constraints*:

- Target + selector allowlisting (can only call the intended router method on the intended router).
- Calldata pinning for safety-critical fields (token pair and recipient/refund fields when present).
- The swap’s own `amountIn` / `amountOutMinimum` in calldata still provides the usual min-out / exact-in protection **for that specific planned tx**.

### What is enforced for approvals

Approvals are constrained by:

- Target + selector allowlisting (can only call `approve` on the intended token contract).
- Spender pinning (spender address must match the planned spender).

**Important**: if the tx plan uses `approve(spender, type(uint256).max)`, that is an intentionally unlimited allowance. This demo does not currently rewrite approvals into “exact amount only”.

### What is enforced for liquidity mint/rebalance

Liquidity Manager actions are constrained by:

- Target + selector allowlisting (can only call the intended Liquidity Manager method on the intended target).
- Calldata pinning for the delegator’s address wherever it appears (to help ensure outputs/refunds stay routed back to the user).

**Important**: the demo does not currently provide an “amount per hour/day minted” enforcer. If you need stronger protection for minting, use short-lived delegations (per-plan), and/or pin additional calldata words (amounts/range parameters) so the agent cannot change them.

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
- (Optional, output) `DEMO_OUT_TX_FILE` / `--out-tx-file`: where to write the planned Ember txs for inspection (default in `.env.example`: `./txs.log`). This file is overwritten each run and is **not** read as an input unless you explicitly pass it via `--tx-file`.

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

### RPC / gas estimation quirks

Some RPC providers are flaky with `eth_estimateGas` for large calldata (common with `redeemDelegations`). If you see estimation errors like “gas required exceeds allowance”, you can bypass estimation by setting:

- `DEMO_GAS_LIMIT=<integer>` (e.g. `DEMO_GAS_LIMIT=2000000`)

### Debugging redeem failures

Set `DEMO_DEBUG_REDEEM=true` to print a structured summary of the `permissionContexts`, `modes`, and `executions` tuples before sending the redeem tx. This is the fastest way to spot:

- mismatched array lengths
- unintended delegation chaining (chain length > 1)
- a tx matching the wrong delegation intent

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
