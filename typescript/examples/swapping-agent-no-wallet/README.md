# Swapping Agent No Wallet

This is a Model Context Protocol (MCP) agent example that demonstrates how to use the EmberAI MCP server for swapping tokens across multiple EVM chains. The agent returns transaction data to be signed by a connected user wallet since no integrated wallet is included.

## Features

- No integrated wallet: transaction data is returned for user signing
- Supports swapping tokens across Arbitrum, Ethereum, Optimism, Polygon, and Base
- Natural language interface for all swap and protocol questions
- Token caching for improved performance
- Enhanced intent detection for swap operations
- Protocol encyclopedia integration for Camelot DEX

## Getting Started

The swapping agent is automatically started when the frontend spins up. To start and interact with the swapping agent through the frontend, refer to [this guide](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/clients/web#quickstart). If you prefer to start the agent manually, follow these steps:

### Prerequisites

- [Node.js 22+](https://nodejs.org/)
- [pnpm](https://pnpm.io/) (npm install -g pnpm)
- QuickNode API access for blockchain interactions
- OpenRouter API key for LLM access

### Set Up Your Environment

1. Clone the repository and navigate to the swapping agent's directory:

```bash
git clone https://github.com/EmberAGI/arbitrum-vibekit.git &&
cd arbitrum-vibekit/typescript/examples/swapping-agent-no-wallet
```

2. Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

Make sure to fill in the API keys and configuration variables.

3. Install dependencies and build:

```bash
pnpm install
pnpm build
```

### Start the Agent

Run the following command to start the agent:

```bash
pnpm start
```

Alternatively you can use Docker to run the agent:

```bash
pnpm docker:build
pnpm docker:run
```

Or with Docker Compose:

```bash
pnpm docker:compose:up
```

## Agent Capabilities

The agent exposes an MCP-compatible interface with the following capabilities:

- `swap` / `convert`: Swap one token for another, including cross-chain swaps (e.g., "Swap 1 ETH for USDC on Arbitrum", "Convert 100 USDT to ARB on Polygon")
- `askEncyclopedia`: Ask protocol-specific questions about Camelot DEX (e.g., "What is slippage?", "How does Camelot's liquidity mining work?")

> [!NOTE]
> The agent maintains an internal list of available tokens and can answer questions about supported tokens via natural language queries (e.g., "What tokens are available?").
