# Allora Trading Agent

An AI agent that autonomously executes trades based on price predictions from the Allora network, using the Ember On-chain Actions MCP server.

## Overview

The Allora Trading Agent combines the predictive power of the Allora network with the on-chain execution capabilities of Ember. It operates by:

1.  Fetching a price prediction for a given token from Allora.
2.  Using an LLM to analyze the prediction and decide on a trading strategy (Buy, Sell, or Hold).
3.  Executing `swap` transactions on-chain via the Ember MCP server.

This creates a powerful, autonomous agent capable of reacting to market forecasts.

## Features

- **Autonomous Trading**: Automatically executes trades based on prediction data.
- **Dual MCP Integration**: Seamlessly orchestrates two MCP servers: Allora for data and Ember for on-chain actions.
- **LLM-Powered Decisions**: Leverages a Large Language Model to interpret predictions and decide on the best course of action.
- **Extensible**: The trading logic can be easily modified or enhanced.

## Architecture

The agent's logic is encapsulated within a single, powerful skill:

### Skill: `tradingSkill`

- **Description**: Analyzes crypto price predictions and executes trades.
- **Input**: A natural language query, like "Should I buy BTC?".
- **Orchestration Flow**:
  1.  **Get Prediction**: Calls the `getPricePredictionTool` to get the latest forecast from the Allora network.
  2.  **Make Decision**: Passes the forecast to the `makeTradeDecisionTool`, which uses a simple heuristic (or a more complex model) to return a `BUY`, `SELL`, or `HOLD` decision.
  3.  **Execute Trade**: If the decision is `BUY` or `SELL`, it calls the corresponding `buyTokenTool` or `sellTokenTool`, which in turn use the `swapTokens` functionality of the Ember MCP server.

## Quick Start

1.  **Install dependencies** from the `typescript/` directory:

    ```bash
    pnpm install
    ```

2.  **Set up environment**:

    Create a `.env` file in this directory (`typescript/examples/allora-trading-agent`) with your API keys and a private key.

    ```bash
    # .env
    OPENROUTER_API_KEY=your_openrouter_api_key
    ALLORA_API_KEY=your_allora_api_key

    # Required for on-chain transactions via Ember
    PRIVATE_KEY=your_wallet_private_key
    ```

    **Security Warning**: Your `PRIVATE_KEY` is used to sign transactions. Keep it secure and never commit it to version control. Use a dedicated development wallet with a small amount of funds for testing.

3.  **Build the agent** from the `typescript/` directory:

    ```bash
    pnpm build
    ```

4.  **Run in development** from this directory:
    ```bash
    pnpm dev
    ```

## Usage Examples

Once the agent is running, you can interact with it through any MCP-compatible client:

```
"What is the BTC price prediction? Should I buy?"
"Get the latest ETH forecast and trade accordingly."
"Sell 50% of my ARB holdings if the prediction is negative."
```

## Project Structure

```
allora-trading-agent/
├── src/
│   ├── index.ts                # Agent configuration and startup
│   ├── skills/
│   │   └── tradingSkill.ts     # The core skill orchestrating the logic
│   └── tools/
│       ├── getPricePrediction.ts   # Tool to fetch predictions from Allora
│       ├── makeTradeDecisionTool.ts # Tool to decide on a trade
│       └── tradingTools.ts         # Wrapper tools for buying and selling
├── package.json
└── README.md
```

## Environment Variables

| Variable             | Description                                                                 | Required |
| -------------------- | --------------------------------------------------------------------------- | -------- |
| `OPENROUTER_API_KEY` | Your API key for the OpenRouter service.                                    | Yes      |
| `ALLORA_API_KEY`     | Your API key for the Allora service.                                        | Yes      |
| `PRIVATE_KEY`        | **(Sensitive)** Your wallet private key for signing on-chain transactions.  | **Yes**  |
| `PORT`               | Server port for the agent (default: 3008).                                  | No       |
| `LLM_MODEL`          | LLM model name (default: google/gemini-flash-1.5).                          | No       |
| `ALLORA_MCP_PORT`    | Port for the spawned Allora MCP server (default: 3009).                     | No       |
| `EMBER_ENDPOINT`     | gRPC endpoint for the Ember server (default: `grpc.api.emberai.xyz:50051`). | No       |

## Technical Details

- **Framework**: Arbitrum Vibekit
- **LLM Provider**: Vercel AI SDK (`createProviderSelector`)
- **MCP Integration**:
  - Allora MCP server (via STDIO)
  - Ember MCP server (via STDIO)
- **Language**: TypeScript
- **Runtime**: Node.js 20+

## License

[License information here]
