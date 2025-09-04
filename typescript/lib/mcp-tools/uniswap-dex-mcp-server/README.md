# Uniswap DEX MCP Server (Vibekit)

Production-ready MCP server exposing secure Uniswap V3 DEX utilities for agents on EVM chains (Arbitrum-first). Includes ERC-20 safety checks, quoting, and swap tx building with slippage/deadline helpers.

## Features
- ERC-20 safety: verify token contract code + name/symbol/decimals
- Allowance reads and approval tx builder
- Uniswap V3 pool state reads (token0/1, fee, liquidity, slot0)
- Quotes via Quoter V2 with automatic fallback to V1
- Build unsigned Uniswap V3 exactInputSingle swap tx
- Helpers: min amountOut with slippage, deadline timestamp

## Environment
Create `.env` here:

```
ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc
# Optional if you also test Ethereum mainnet
ETHEREUM_RPC_URL=https://eth.llamarpc.com
```

Use your own RPC (Infura/Alchemy) for reliability and higher rate limits.

## Build & Inspect
```bash
cd typescript/lib/mcp-tools/uniswap-dex-mcp-server
pnpm build
pnpm run inspect:npx
```

## Known Addresses (Arbitrum One)
- Quoter V2: `0x61fFE014bA17989E743c5F6cB21bF9697530B21e`
- Quoter V1: `0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6`
- SwapRouter02: `0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45`
- USDC: `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` (6 decimals)
- WETH: `0x82af49447d8a07e3bd95bd0d56f35241523fbab1` (18 decimals)
- ARB: `0x912ce59144191c1204e64559fe8253a0e49e6548` (18 decimals)

## Tools and Example Payloads

### list_supported_tokens
Parameters: none

### verify_erc20
```json
{ "chainId": 42161, "token": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" }
```

### get_allowance
```json
{
  "chainId": 42161,
  "token": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  "owner": "0x0000000000000000000000000000000000000001",
  "spender": "0x0000000000000000000000000000000000000002"
}
```

### build_approval_tx
```json
{
  "chainId": 42161,
  "token": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  "spender": "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
  "amount": "1000000"
}
```

### get_pool_state
```json
{ "chainId": 42161, "pool": "<UNISWAP_V3_POOL_ADDRESS>" }
```

### get_v3_quote (V2 preferred; automatic fallback to V1)
```json
{
  "chainId": 42161,
  "quoter": "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
  "tokenIn": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  "tokenOut": "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
  "fee": 500,
  "amountIn": "1000000",
  "useV2": true,
  "recipient": "0x0000000000000000000000000000000000000000",
  "sqrtPriceLimitX96": "0"
}
```
If V2 reverts, the tool retries with V1 and returns `{ via: "v1-fallback" }`.

### get_oracle_price
```json
{ "chainId": 42161, "aggregator": "<CHAINLINK_AGGREGATOR_ADDRESS>" }
```

### validate_quote_against_oracle
```json
{
  "amountIn": "1000000",
  "amountOut": "590000000000000000",
  "tokenInDecimals": 6,
  "tokenOutDecimals": 18,
  "oraclePrice": "3000000000",
  "oracleDecimals": 8,
  "maxDeviationBps": 100
}
```

### get_pool_twap_tick
```json
{ "chainId": 42161, "pool": "<UNISWAP_V3_POOL_ADDRESS>", "secondsAgo": 300 }
```

### compute_safe_slippage_bps
```json
{ "averageTick": 50, "baseBps": 30, "perTickBps": 1, "maxBps": 300 }
```

### build_eip2612_permit
```json
{
  "chainId": 42161,
  "token": "<ERC20_WITH_EIP2612>",
  "owner": "<WALLET>",
  "spender": "<ROUTER_OR_SPENDER>",
  "value": "1000000",
  "nonce": "0",
  "deadline": "1735689600"
}
```

### build_permit2_permit
```json
{
  "chainId": 42161,
  "permit2": "<PERMIT2_ADDRESS>",
  "token": "<ERC20>",
  "amount": "1000000",
  "expiration": "1735689600",
  "nonce": "0",
  "spender": "<ROUTER_OR_SPENDER>",
  "sigDeadline": "1735689600"
}
```

### compute_mev_risk_score
```json
{
  "amountIn": "1000000000000000000",
  "amountOut": "590000000000000000",
  "tokenInDecimals": 18,
  "tokenOutDecimals": 18,
  "poolLiquidity": "10000000000000000000",
  "recentVolatility": 5,
  "baseFee": "10000000000"
}
```

### build_private_tx_payload
```json
{
  "chainId": 42161,
  "to": "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
  "data": "0x...",
  "value": "0x0",
  "gasLimit": "200000",
  "maxFeePerGas": "10000000000",
  "maxPriorityFeePerGas": "2000000000"
}
```

### recommend_v3_fee_tier
```json
{
  "chainId": 42161,
  "tokenIn": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  "tokenOut": "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
  "amountIn": "1000000",
  "poolAddresses": {
    "500": "<POOL_500_ADDRESS>",
    "3000": "<POOL_3000_ADDRESS>",
    "10000": "<POOL_10000_ADDRESS>"
  },
  "lookbackSeconds": 300
}
```

### plan_twap_execution
```json
{
  "totalAmountIn": "10000000000000000000",
  "totalAmountOutMin": "5900000000000000000",
  "deadline": "1735689600",
  "sliceCount": 10,
  "intervalSeconds": 60,
  "slippageBps": 50
}
```

### compute_min_amount_out
```json
{ "amountOut": "1234500000000000000", "slippageBps": 50 }
```

### compute_deadline
```json
{ "secondsFromNow": 300 }
```

### build_v3_exact_input_single_tx
```json
{
  "chainId": 42161,
  "router": "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
  "tokenIn": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  "tokenOut": "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
  "fee": 500,
  "recipient": "0x0000000000000000000000000000000000000001",
  "deadline": "1735689600",
  "amountIn": "1000000",
  "amountOutMinimum": "990000",
  "sqrtPriceLimitX96": "0"
}
```

## Security Guidance
- Always compute `amountOutMinimum` using slippage (e.g., 30–100 bps) via `compute_min_amount_out`.
- Always set a short `deadline` (e.g., 300 seconds) via `compute_deadline`.
- Approvals: prefer minimal exact-amount approvals. Avoid infinite approvals by default.
- Validate tokens via `verify_erc20` before use.
- Prefer RPCs with your own API key to avoid rate limiting or tampering.

## Troubleshooting
- Revert on `get_v3_quote`:
  - Try another fee tier (500, 3000, 10000).
  - Ensure `useV2: true` for the V2 quoter; fallback to V1 occurs automatically.
  - Use reliable RPC endpoints.
- `get_pool_state` requires a real Uniswap V3 pool address.
- All amounts are wei as decimal strings (no decimals, no hex strings).

## License
MIT

