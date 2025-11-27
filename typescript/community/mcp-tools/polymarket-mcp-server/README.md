# Polymarket MCP Server – Agentic Trading on Prediction Markets

A Model Context Protocol (MCP) server that lets Vibekit agents discover markets, inspect order books, and place/cancel trades on Polymarket’s CLOB using the official TypeScript client.

## Features

- **Native Polymarket support** on Polygon (chain id 137)
- **Trading-ready**: place and cancel limit orders via CLOB REST
- **Market discovery**: list markets and inspect order books by token
- **Portfolio insight**: fetch current positions and recent fills
- **Safety-first**: hard caps on size/notional plus strict Zod validation
- **Multi-transport**: HTTP SSE and STDIO MCP transports
- **Agent-friendly**: designed to plug directly into Vibekit skills

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm package manager
- A funded Polymarket account on Polygon (USDC balance + allowances set)
- A private key for that account (EOA, MetaMask export, or Magic/email export)

### Installation

```bash
git clone https://github.com/EmberAGI/arbitrum-vibekit.git
cd arbitrum-vibekit/typescript/community/mcp-tools/polymarket-mcp-server

pnpm install
pnpm build
```

### Environment Setup

Create a `.env` file in this directory:

```bash
POLYMARKET_HOST=https://clob.polymarket.com
POLYMARKET_CHAIN_ID=137

POLYMARKET_FUNDER_ADDRESS=0xYourPolygonAddressHere
POLYMARKET_PRIVATE_KEY=0xyour_private_key_here

# 0 = EOA, 1 = Magic/email login, 2 = browser wallet (MetaMask, Coinbase, etc.)
POLYMARKET_SIGNATURE_TYPE=1

POLYMARKET_MAX_ORDER_SIZE=100
POLYMARKET_MAX_ORDER_NOTIONAL=500

PORT=3020
```

### Running the Server

```bash
pnpm dev

# or
pnpm build && pnpm start
```

You should see:

```text
Polymarket MCP server listening on 3020
```

## Available Tools

The Polymarket MCP server exposes tools for markets, orderbooks, positions, trading, and history:

- `list_markets`
- `get_orderbook`
- `get_positions`
- `place_limit_order`
- `cancel_order`
- `get_trade_history`

Each tool returns human-readable JSON payloads suitable for agent reasoning and logging.

## Integration with Vibekit Agents

```ts
export const polymarketAgentConfig = {
  skills: [
    {
      id: 'polymarket-trading',
      name: 'Polymarket Trading',
      description: 'Discover and trade Polymarket markets on Polygon',
      mcpServers: {
        'polymarket-clob': {
          url: process.env.POLYMARKET_MCP_SERVER_URL ?? 'http://localhost:3020',
          alwaysAllow: [
            'list_markets',
            'get_orderbook',
            'get_positions',
            'place_limit_order',
            'cancel_order',
            'get_trade_history',
          ],
        },
      },
      tools: [],
    },
  ],
};
```

## Configuration Reference

| Variable                         | Default                      | Description                                |
|----------------------------------|------------------------------|--------------------------------------------|
| `POLYMARKET_HOST`               | `https://clob.polymarket.com` | Polymarket CLOB REST endpoint             |
| `POLYMARKET_CHAIN_ID`           | `137`                        | Chain ID (Polygon mainnet)                 |
| `POLYMARKET_FUNDER_ADDRESS`     | _required_                   | Polygon address holding USDC               |
| `POLYMARKET_PRIVATE_KEY`        | _required_                   | Private key for the trading account        |
| `POLYMARKET_SIGNATURE_TYPE`     | `1`                          | 0 = EOA, 1 = Magic/email, 2 = browser wallet |
| `POLYMARKET_MAX_ORDER_SIZE`     | `100`                        | Max shares per order                       |
| `POLYMARKET_MAX_ORDER_NOTIONAL` | `500`                        | Max notional in USDC per order             |
| `PORT`                          | `3020`                       | HTTP transport port                        |


