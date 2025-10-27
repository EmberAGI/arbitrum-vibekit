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
- At least one AI provider API key (OpenRouter, OpenAI, Grok/xAI, or Hyperbolic)

### Set Up Your Environment

1. Clone the repository and navigate to the swapping agent's directory:

```bash
git clone https://github.com/EmberAGI/arbitrum-vibekit.git &&
cd arbitrum-vibekit/typescript/community/swapping-agent-no-wallet
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

### AI Provider Setup

This agent supports multiple AI providers. Configure at least one by setting the appropriate environment variable:

```bash
# Option 1: OpenRouter (supports many models)
OPENROUTER_API_KEY=your-openrouter-api-key

# Option 2: OpenAI
OPENAI_API_KEY=your-openai-api-key

# Option 3: Grok (xAI)
XAI_API_KEY=your-xai-api-key

# Option 4: Hyperbolic
HYPERBOLIC_API_KEY=your-hyperbolic-api-key
```

When multiple providers are configured, you can specify which one to use:

```bash
# Optional: Choose provider (defaults to first available)
AI_PROVIDER=openrouter  # openrouter | openai | grok | hyperbolic

# Optional: Specify model (defaults to provider-specific model)
AI_MODEL=google/gemini-2.5-flash
```

Default models by provider:

- OpenRouter: `google/gemini-2.5-flash`
- OpenAI: `gpt-4o`
- Grok: `grok-3`
- Hyperbolic: `meta-llama/Llama-3.3-70B-Instruct`

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
