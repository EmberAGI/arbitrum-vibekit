# OpenSea Actions MCP Server

OpenSea MCP Server for write actions (approvals, listings, purchases) on Arbitrum NFTs.

## Features

- **Arbitrum-only**: All operations restricted to Arbitrum chain
- **Non-custodial**: EIP-712 signing-based execution (no private keys)
- **Environment-gated**: Write operations disabled unless `ENABLE_OPENSEA_WRITE=true`
- **Complete Tool Suite**:
  - **Phase 1 (Trading Basics)**:
    - `approve_token` - Approve NFT contracts for trading
    - `list_nft` - Create fixed-price listings
    - `buy_nft` - Purchase listed NFTs (prepare-only by default)
  - **Phase 2 (Advanced Operations)**:
    - `make_offer` - Create offers for assets or collections
    - `cancel_offer` - Cancel existing offers
    - `transfer_nft` - Transfer NFTs between wallets
    - `wrap_weth` - Wrap ETH to WETH
    - `unwrap_weth` - Unwrap WETH to ETH
    - `bulk_cancel` - Cancel multiple orders at once

## Installation

```bash
cd typescript/lib/mcp-tools/opensea-actions-mcp-server
pnpm install
pnpm build
```

## Usage

### Environment Variables

```bash
# Required: Arbitrum RPC URL
export ARBITRUM_RPC_URL=https://arbitrum.llamarpc.com

# Optional: Enable write actions (disabled by default)
export ENABLE_OPENSEA_WRITE=true

# Optional: HTTP server port (default: 3050)
export PORT=3050

# Optional: Enable HTTP server
export ENABLE_HTTP=true
```

### Running the Server

#### STDIO Mode (for agents)
```bash
pnpm start
```

#### HTTP/SSE Mode (for MCP Inspector)
```bash
ENABLE_HTTP=true PORT=3050 pnpm start
```

### Testing with MCP Inspector

1. Start the server in HTTP mode
2. Open MCP Inspector
3. Connect to `http://localhost:3050/sse`
4. Test the tools:
   - **Phase 1**: `approve_token`, `list_nft`, `buy_nft`
   - **Phase 2**: `make_offer`, `cancel_offer`, `transfer_nft`, `wrap_weth`, `unwrap_weth`, `bulk_cancel`

**Example Test Cases:**
- `approve_token` with contract address: `"0x1234567890123456789012345678901234567890"`
- `list_nft` with contract, token_id, price: `contract_address`, `token_id: "123"`, `price: "1.0"`
- `make_offer` for collection offer: `contract_address`, `price: "0.5"`, `offer_type: "collection"`
- `wrap_weth` with amount: `amount: "0.1"`

## Security

- **Non-custodial by default**: All operations prepare transactions but don't execute them
- **Environment gating**: Set `ENABLE_OPENSEA_WRITE=true` to enable actual execution
- **Arbitrum-only**: Operations restricted to Arbitrum chain for security

## Integration

This server is designed to work with the Ember Plugin System for on-chain execution.
