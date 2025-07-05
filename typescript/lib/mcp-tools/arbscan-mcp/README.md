# Arbiscan MCP Server

This package exposes a simple Model Context Protocol (MCP) server that wraps the [Arbiscan](https://arbiscan.io/) API. It allows Vibekit agents to query on-chain data from Arbitrum One (mainnet) and Arbitrum Sepolia (testnet).

## Environment Variables

Copy `.env.example` to `.env` and provide your Arbiscan API key:

```
cp .env.example .env
```

- `ARBISCAN_API_KEY` – Your Arbiscan API key.
- `ARBISCAN_BASE_URL` – (optional) Base URL for mainnet. Defaults to `https://api.arbiscan.io/api`.
- `ARBISCAN_TESTNET_BASE_URL` – (optional) Base URL for testnet. Defaults to `https://api-testnet.arbiscan.io/api`.

## Usage

Install dependencies and run the server in development mode:

```
pnpm install
pnpm start
```

You can inspect the MCP API with:

```
pnpm run build && npx -y @modelcontextprotocol/inspector node ./dist/index.js
```

## Tools Exposed

- `getAccountBalance` – Retrieve ETH balance for an address.
- `getTransaction` – Fetch details for a transaction hash.
- `getTokenTransfers` – List ERC‑20 token transfers involving an address.
- `getTokenBalance` – Get an ERC‑20 token balance for a wallet.
- `getBlockNumber` – Return the latest block number.
- `getGasPrice` – Return the current gas price in wei.

Each tool accepts a `network` parameter of `mainnet` or `testnet` to choose the Arbitrum chain.
