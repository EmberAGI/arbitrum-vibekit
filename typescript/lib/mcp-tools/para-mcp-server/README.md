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
Create (or cache) a pregenerated wallet for the supplied identifier. If Para already has a wallet, the tool seeds a placeholder entry locally.

**Parameters**
- `identifier` *(string, required)* – Unique identifier value (email, phone, etc.).
- `identifierType` *(enum, default `email`)* – One of `email`, `phone`, `username`, `id`, `custom`.
- `walletType` *(enum, default `EVM`)* – One of `EVM`, `SOLANA`, `COSMOS`.

**Response Artifact (text JSON)**
```json
{
  "walletId": "mock-wallet-id",
  "identifierKey": "email",
  "identifierValue": "user@example.com",
  "walletType": "EVM",
  "userShareJson": "{\"share\":\"...\"}",
  "createdAt": "2025-09-23T12:34:56.000Z"
}
```

### `list_pregen_wallets`
Return the entire in-memory cache of pregenerated wallets.

**Parameters**: none

**Response Artifact (text JSON)** – Array of the cached wallet records.

### `claim_pregen_wallet`
Fetch a cached wallet’s identifier metadata and user share for client-side claiming flows.

**Parameters**
- `identifier` *(string, required)*
- `identifierType` *(enum, default `email`)*

**Response Artifact (text JSON)**
```json
{
  "identifierKey": "email",
  "identifierValue": "user@example.com",
  "address": "0x1234...abcd",
  "isClaimed": false,
  "note": "This pregenerated wallet is not claimed. You can claim it from the frontend using the Claim button."
}
```

> Note: Transaction signing is not exposed as an MCP tool in the current version.

## 🔧 Configuration

### Environment Variables
- `PARA_API_KEY` *(required)* – Server-side Para API key used to instantiate the SDK client.
- `PARA_ENVIRONMENT` *(optional)* – `BETA` (default) or `PRODUCTION`; mapped to `Environment` enum in the SDK.
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
│   ├── claimPregenWallet.ts
│   ├── createPregenWallet.ts
│   ├── listPregenWallets.ts
│   
└── utils/
    └── paraServer.ts    # Para SDK helpers and test overrides
```

## 🔄 Recent Updates
- Migrated from CoinGecko tooling to Para pregenerated wallet workflows.
- Removed deprecated tools (`check_address_balance`, transaction signing) to align with current Para wallet flows.
- Added injectable Para SDK/client overrides to enable deterministic testing.

This server is the reference implementation for Para wallet orchestration inside the Arbitrum VibeKit agent ecosystem.
