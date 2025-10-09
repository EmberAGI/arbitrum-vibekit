# Para MCP Server

A Model Context Protocol (MCP) server that wraps the [Para Server SDK](https://docs.getpara.com/server-sdk) to manage pregenerated wallets for Arbitrum VibeKit agents. The server exposes tools for creation, discovery, and claiming of pregenerated wallets, while caching state locally for rapid agent development.

## 🚀 Features
- **Pregenerated wallet tooling**: Create, list, and claim pregenerated wallets against Para-managed accounts. A helper HTTP route is available to mark a wallet as claimed.
- **In-memory cache**: Stores pregenerated wallet metadata and user shares locally so repeated tool calls are instant during a session.
- **Dual transport support**: Streamable HTTP endpoint (`/mcp`) and optional stdio transport for local MCP inspectors/devtools (enable via `MCP_STDIO_ENABLED=true`).
- **Robust Para integration**: Graceful fallbacks when the SDK shape changes, plus actionable `VibkitError` messages for missing configuration.
- **Test-friendly design**: Injectable Para SDK/client mocks so the included test suite can run without network calls.

## 🛠 Architecture

### Transport Layer
- **StreamableHTTPServerTransport** served via Hono + Node HTTP server (`/mcp` route with POST/GET/DELETE semantics).
- **StdioServerTransport** for CLI-based MCP tooling and automated tests.

### Supporting Modules
- `store/pregenWalletStore.ts`: In-memory registry for pregenerated wallets and their user shares.
- `utils/paraServer.ts`: Lazy Para SDK loader with override hooks used by tests; enforces presence of `PARA_API_KEY`.
- `tools/*.ts`: Individual tool implementations leveraging the store and Para client.

## 🧰 Tools Available

### `create_pregen_wallet`
Create (or cache) a pregenerated wallet for the supplied email. If Para already has a wallet, the tool seeds a placeholder entry locally. Always creates EVM wallets.

**Parameters**
- `email` *(string, required)* – Email address for pregenerated wallet (must be valid email format).

**Response Artifact (text JSON)**
```json
{
  "recordId": "550e8400-e29b-41d4-a716-446655440000",
  "walletId": "mock-wallet-id",
  "address": "0x1234...abcd",
  "email": "user@example.com",
  "userShareJson": "{\"share\":\"...\"}",
  "createdAt": "2025-09-23T12:34:56.000Z",
  "isClaimed": false,
  "rawWallet": {}
}
```

### `list_pregen_wallets`
Return the entire in-memory cache of pregenerated wallets.

**Parameters**: none

**Response Artifact (text JSON)** – Array of the cached wallet records.

### `claim_pregen_wallet`
Fetch a cached wallet's identifier metadata and user share for client-side claiming flows.

**Parameters**
- `email` *(string, required)* – Email address for pregenerated wallet (must be valid email format).

**Response Artifact (text JSON)**
```json
{
  "email": "user@example.com",
  "address": "0x1234...abcd",
  "isClaimed": false,
  "note": "This pregenerated wallet is not claimed. You can claim it from the frontend using the Claim button."
}
```

### `request_faucet`
Request testnet faucet funds from Coinbase CDP for Base Sepolia or other supported EVM test networks. Returns transaction hash and explorer link.

**Parameters**
- `address` *(string, required)* – Ethereum address to receive faucet funds (must be valid 0x... format)
- `token` *(enum, default `eth`)* – One of `eth`, `usdc`, `eurc`, `cbbtc`
- `network` *(enum, default `base-sepolia`)* – One of `base-sepolia`, `ethereum-sepolia`, `ethereum-holesky`

**Response Artifact (text JSON)**
```json
{
  "success": true,
  "transactionHash": "0x53e11e94ebb2438d6ddcfa07dabc9b551d2f440f8363fea941083bc397a86a42",
  "address": "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
  "network": "base-sepolia",
  "token": "eth",
  "explorerLink": "https://sepolia.basescan.org/tx/0x53e11e94ebb2438d6ddcfa07dabc9b551d2f440f8363fea941083bc397a86a42",
  "note": "Faucet funds requested successfully. Transaction may take a few moments to confirm on-chain."
}
```

**Rate Limits (24-hour rolling window)**
- ETH: 0.0001 per request, 0.1 max per 24h
- USDC/EURC: 1 per request, 10 max per 24h
- cbBTC: 0.0001 per request, 0.001 max per 24h

### `transfer_eth`
Transfer ETH from a pregenerated wallet to another address on Base Sepolia or other supported EVM test networks. Looks up the wallet by email, loads the userShare from memory, and executes the transfer using Para's transfer method. Amount is specified in ETH (e.g., "0.001") and automatically converted to wei.

**Parameters**
- `email` *(string, required)* – Email address for the pregenerated wallet (e.g., `panda@gmail.com`, must be valid email format)
- `recipientAddress` *(string, required)* – Recipient Ethereum address (must be valid 0x... format)
- `amount` *(string, required)* – Amount to transfer in ETH (e.g., `"0.001"` for 0.001 ETH, `"0.00001"` for 0.00001 ETH)
- `network` *(enum, default `base-sepolia`)* – One of `base-sepolia`, `ethereum-sepolia`, `ethereum-holesky`, `arbitrum-sepolia`

**Response Artifact (text JSON)**
```json
{
  "success": true,
  "transactionHash": "0xabc123...",
  "from": "0x1234...abcd",
  "to": "0x5678...ef90",
  "amountEth": "0.001",
  "amountWei": "1000000000000000",
  "chainId": "84532",
  "network": "base-sepolia",
  "explorerLink": "https://sepolia.basescan.org/tx/0xabc123...",
  "note": "ETH transfer completed successfully. Transaction may take a few moments to confirm on-chain."
}
```

**Example Usage Flow**
1. Create a pregenerated wallet: `create_pregen_wallet` with identifier `panda@gmail.com`
2. Request faucet funds: `request_faucet` to fund the wallet address
3. Transfer ETH: `transfer_eth` using identifier `panda@gmail.com` with amount `"0.001"` to send funds to another address

> Note: The wallet must exist in the in-memory cache with a valid userShare to perform transfers.

### `check_balance`
Check ETH balance of any Ethereum address on Base Sepolia or other supported EVM test networks. Returns balance in both ETH and wei formats with current block information.

**Parameters**
- `address` *(string, required)* – Ethereum address to check balance for (must be valid 0x... format)
- `network` *(enum, default `base-sepolia`)* – One of `base-sepolia`, `ethereum-sepolia`, `ethereum-holesky`, `arbitrum-sepolia`

**Response Artifact (text JSON)**
```json
{
  "success": true,
  "address": "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
  "network": "base-sepolia",
  "chainId": 84532,
  "balanceEth": "0.1",
  "balanceWei": "100000000000000000",
  "blockNumber": "12345678",
  "explorerLink": "https://sepolia.basescan.org/address/0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
  "note": "Balance retrieved successfully at block 12345678"
}
```

**Example Usage**
```bash
# Check balance on Base Sepolia (default)
pnpm balance:check 0x742d35Cc6634C0532925a3b844Bc454e4438f44e

# Check balance on Arbitrum Sepolia
pnpm balance:check 0x742d35Cc6634C0532925a3b844Bc454e4438f44e arbitrum-sepolia
```

### Environment Variables
- `PARA_API_KEY` *(required)* – Server-side Para API key used to instantiate the SDK client.
- `PARA_ENVIRONMENT` *(optional)* – `BETA` (default) or `PRODUCTION`; mapped to `Environment` enum in the SDK.
- `CDP_API_KEY_ID` *(required for faucet)* – Coinbase Developer Platform API key ID for JWT authentication.
- `CDP_API_KEY_SECRET` *(required for faucet)* – Coinbase Developer Platform API key secret (PEM format) for JWT authentication.
- `PORT` *(optional)* – HTTP server port (defaults to `3012`).

### Installing & Building
```bash
cd arbitrum-vibekit/typescript/lib/mcp-tools/para-mcp-server
pnpm install
pnpm build
```

### Running Locally
```bash
# Development (tsx + hot reload)
pnpm dev

# Production build + run
pnpm build
pnpm start

# Watch mode (nodemon)
pnpm watch

# Request faucet funds (requires CDP credentials)
pnpm faucet:request 0x742d35Cc6634C0532925a3b844Bc454e4438f44e eth base-sepolia

# Transfer ETH from a pregenerated wallet
pnpm eth:transfer panda@gmail.com 0x742d35Cc6634C0532925a3b844Bc454e4438f44e 0.001

# Check ETH balance of any address
pnpm balance:check 0x742d35Cc6634C0532925a3b844Bc454e4438f44e
```

The HTTP transport listens on `http://localhost:PORT/mcp`; stdio transport is disabled by default and can be enabled by setting `MCP_STDIO_ENABLED=true` before starting the server.

## ✅ Testing

A dedicated test runner exercises every tool using mocked Para SDK clients:
```bash
pnpm --filter @arbitrum-vibekit/para-mcp-server test
```
The suite injects in-memory mocks (via `__setParaModuleForTesting` / `__setParaClientFactoryForTesting`) so no real Para calls are made.

## 🧩 Frontend Integration Highlights

- Configure an MCP transport entry pointing to the `/mcp` endpoint (Streamable HTTP or stdio process).
- Agents should request tools by the names listed above (e.g., `create_pregen_wallet`).
- Returned artifacts contain JSON strings; UI components typically `JSON.parse` the first artifact part for rendering.
- Since the wallet store is in-memory, seed data with `create_pregen_wallet` at session start for deterministic flows.

## 🚨 Error Handling

The tools surface `VibkitError` codes to simplify diagnosis:
- `MissingParaApiKey` (code `-32602`) – `PARA_API_KEY` not set.
- `ParaSdkNotAvailable` (code `-32001`) – SDK module failed to load (install dependency or enable network).
- `PregenWalletNotFound`, `MissingUserShare`, `Para*Unsupported` – Intended for downstream UX messaging.

All tool failures return error tasks that include structured metadata for logging.

## 📦 File Structure
```
src/
├── index.ts             # Combined HTTP + stdio bootstrap
├── mcp.ts               # MCP server + tool registration
├── store/
│   └── pregenWalletStore.ts
├── tools/
│   ├── checkBalance.ts
│   ├── claimPregenWallet.ts
│   ├── createPregenWallet.ts
│   ├── listPregenWallets.ts
│   ├── requestFaucet.ts
│   └── transferEth.ts
└── utils/
    └── paraServer.ts    # Para SDK helpers and test overrides
```

## 🔄 Recent Updates
- Added `check_balance` tool to check ETH balance of any Ethereum address on supported test networks.
- Added `transfer_eth` tool to transfer ETH from pregenerated wallets using their cached userShare.
- Added `request_faucet` tool to request testnet funds from Coinbase CDP for Base Sepolia and other EVM test networks.
- Migrated from CoinGecko tooling to Para pregenerated wallet workflows.
- Removed deprecated tools to align with current Para wallet flows.
- Added injectable Para SDK/client overrides to enable deterministic testing.

This server is the reference implementation for Para wallet orchestration inside the Arbitrum VibeKit agent ecosystem.
