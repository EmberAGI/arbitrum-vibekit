# Lending Agent No Wallet

This is a Model Context Protocol (MCP) agent example that demonstrates how to use the Ember API for:

- Lending related tokens on Arbitrum via AAVE
- The agent returns transaction data to be signed by a connected user wallet

## Features

- No integrated wallet, transaction data is returned to the frontend for user signing
- Support for supplying and borrowing various tokens on Arbitrum
- Retrieval of user positions
- Natural language interface for all operations

## Getting Started

### Prerequisites

- [Node.js 20+](https://nodejs.org/)
- [pnpm](https://pnpm.io/) (npm install -g pnpm)
- Access to Ember API (get API access from EmberAGI)
- QuickNode API access for blockchain interactions

### Installation

1. Clone the repository:

```bash
git clone https://github.com/EmberAGI/arbitrum-vibekit.git
cd arbitrum-vibekit/typescript/examples/lending-agent-no-wallet
```

2. Install dependencies:

```bash
pnpm install
```

3. Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

4. Fill in your environment variables in `.env`:

```
OPENAI_API_KEY=your_openai_key
QUICKNODE_SUBDOMAIN=your_quicknode_subdomain
QUICKNODE_API_KEY=your_quicknode_api_key
```

### Development

```bash
pnpm dev
```

This will build and start the agent in development mode.

### Testing with MCP Inspector

You can test the agent with the MCP Inspector tool:

```bash
pnpm inspect:npx
```

This will start a local inspector that allows you to interact with the agent directly.

### Production Build

```bash
pnpm build
pnpm start
```

### Docker

Build and run with Docker:

```bash
pnpm docker:build
pnpm docker:run
```

Or with Docker Compose:

```bash
pnpm docker:compose:up
```

## Usage

The agent exposes an MCP-compatible interface with the following capabilities:

- `borrow`: Borrow a token (e.g., "Borrow 100 USDC")
- `repay`: Repay a borrowed token (e.g., "Repay 50 DAI")
- `supply`: Supply a token as collateral (e.g., "Supply 0.5 ETH")
- `withdraw`: Withdraw a previously supplied token (e.g., "Withdraw 1000 USDC")
- `getUserPositions`: Get all user positions (e.g., "Show my positions")

## Integration

To integrate this agent into a frontend, connect to it using the MCP client and call the `askLendingAgent` tool with:

- `instruction`: A natural language instruction (e.g., "Borrow 100 USDC")
- `userAddress`: The user's wallet address

The agent will return transaction data in the format:

```json
{
  "txPreview": {
    "tokenName": "USDC",
    "amount": "100",
    "action": "borrow",
    "chainId": "42161"
  },
  "txPlan": [
    {
      "to": "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
      "data": "0x...",
      "value": "0x0",
      "chainId": "42161"
    }
  ]
}
```

## License

This project is licensed under the MIT License. 