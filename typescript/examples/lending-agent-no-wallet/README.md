# Lending Agent No Wallet

This is a Model Context Protocol (MCP) agent example that demonstrates how to use the EmberAI MCP server for lending related tokens on Arbitrum via AAVE. The agent then returns transaction data to be signed by a connected user wallet.

## Features

- No integrated wallet, transaction data is returned to the frontend for user signing
- Support for supplying and borrowing various tokens on Arbitrum
- Retrieval of user positions
- Natural language interface for all operations
- Token caching for better performance
- Enhanced intent detection for various lending operations
- Comprehensive test suite for validating transaction data

## Getting Started

The lending agent is automatically started when the frontend spins up. To start and interact with the lending agent through the frontend, refer to [this guide](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/clients/web#quickstart). If you prefer to start the agent manually, follow these steps:

### Prerequisites

- [Node.js 22+](https://nodejs.org/)
- [pnpm](https://pnpm.io/) (npm install -g pnpm)
- QuickNode API access for blockchain interactions
- OpenRouter API key for LLM access

### Set Up Your Environment

1. Clone the repository and navigate to the lending agent's directory:

```bash
git clone https://github.com/EmberAGI/arbitrum-vibekit.git &&
cd arbitrum-vibekit/typescript/examples/lending-agent-no-wallet

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

- `borrow`: Borrow a token (e.g., "Borrow 100 USDC")
- `repay`: Repay a borrowed token (e.g., "Repay 50 DAI")
- `supply`: Supply a token as collateral (e.g., "Supply 0.5 ETH")
- `withdraw`: Withdraw a previously supplied token (e.g., "Withdraw 1000 USDC")
- `getUserPositions`: Get all user positions (e.g., "Show my positions")
- `askEncyclopedia`: Ask protocol-specific questions about Aave or lending (e.g., "What is the liquidation threshold for WETH on Aave?")

> [!NOTE]
> While there is no dedicated `listTokens` tool, the agent maintains an internal list of available tokens and can answer questions about supported tokens via natural language queries (e.g., "What tokens are available?").
