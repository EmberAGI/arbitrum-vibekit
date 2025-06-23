# Allora Trading Agent

An AI-powered trading agent that combines Allora's market predictions with Ember's DeFi trading capabilities to make intelligent trading decisions.

## Overview

This agent demonstrates how to integrate multiple MCP (Model Context Protocol) servers to create a sophisticated trading system. It uses:

- **Allora MCP Server**: For AI-powered price predictions from decentralized prediction markets
- **Ember MCP Server**: For executing token swaps across 200+ DeFi protocols

## Features

- 📊 **Market Forecasting**: Get AI-powered price predictions for major cryptocurrencies
- 🤖 **Trading Analysis**: Analyze market conditions and provide actionable trading recommendations
- 💱 **Trade Execution**: Execute token swaps across multiple chains via Ember
- 🔄 **Workflow Automation**: Combined predict-analyze-trade workflows
- ⚡ **Multi-Chain Support**: Trade on Arbitrum, Ethereum, Base, Optimism, and Polygon

## Skills

### 1. Market Forecast

Get price predictions from Allora's prediction markets.

**Examples:**

- "What is the BTC price prediction for the next 24 hours?"
- "Get me the ETH price forecast"
- "Show price predictions for Bitcoin"

### 2. Trading Analysis

Analyze predictions and market conditions to provide trading recommendations.

**Examples:**

- "Should I buy BTC based on the current predictions?"
- "Analyze ETH trading opportunity with $1000 investment"
- "What's the risk-reward ratio for buying ETH now?"

### 3. Trade Execution

Execute token swaps across DeFi protocols.

**Examples:**

- "Buy 100 USDC worth of ETH"
- "Swap 0.5 ETH for USDC"
- "Trade 1000 ARB tokens for ETH with 1% slippage"

## Setup

### Prerequisites

- Node.js 18+
- pnpm package manager
- OpenRouter API key for LLM access
- Allora API key (optional, for production use)

### Environment Variables

Create a `.env` file in the agent directory:

```bash
# Required
OPENROUTER_API_KEY=your_openrouter_api_key

# Optional
ALLORA_API_KEY=your_allora_api_key
EMBER_ENDPOINT=grpc.api.emberai.xyz:50051
AGENT_NAME="Allora Trading Agent"
AGENT_VERSION="1.0.0"
PORT=3008
ALLORA_MCP_PORT=3009
EMBER_MCP_PORT=3010
LLM_MODEL=google/gemini-2.5-flash-preview
LOG_LEVEL=info
```

### Installation

From the agent directory:

```bash
# Install dependencies
pnpm install

# Build the agent
pnpm build

# Run in development mode
pnpm dev
```

## Usage

### Basic Price Prediction

```
User: "What's the BTC price prediction?"
Agent: Based on Allora's prediction markets, BTC is forecasted to reach $XX,XXX in the next 24 hours...
```

### Trading Analysis

```
User: "Should I buy ETH with $1000?"
Agent: Let me analyze the current market conditions...
- Current ETH price: $X,XXX
- 24h prediction: $X,XXX (+X.X%)
- Recommendation: BUY with moderate confidence
- Suggested position size: $500 (50% of available funds)
- Risk level: Medium
```

### Execute Trade

```
User: "Buy 100 USDC worth of ETH on Arbitrum"
Agent: Preparing your trade...
- From: 100 USDC
- To: ~0.XXX ETH
- Chain: Arbitrum
- Estimated gas: $X.XX
- Slippage: 1%
[Transaction data returned for signing]
```

### Combined Workflow

```
User: "Get ETH prediction and buy if it looks good"
Agent:
1. Fetching ETH price prediction...
   - Current: $X,XXX
   - 24h forecast: $X,XXX (+X.X%)

2. Analyzing trading opportunity...
   - Trend: Bullish
   - Confidence: High
   - Recommendation: BUY

3. Would you like to proceed with the trade? [Specify amount and chain]
```

## Supported Tokens

Initial support includes:

- BTC/WBTC (Bitcoin)
- ETH/WETH (Ethereum)
- USDC (USD Coin)
- ARB (Arbitrum)
- DAI (Dai Stablecoin)
- USDT (Tether)

## Supported Chains

- Arbitrum (42161) - Primary
- Ethereum (1)
- Base (8453)
- Optimism (10)
- Polygon (137)

## Architecture

The agent uses Vibekit's skill-based architecture:

```
allora-trading-agent/
├── src/
│   ├── index.ts              # Agent entry point
│   ├── skills/               # High-level capabilities
│   │   ├── marketForecast.ts
│   │   ├── tradingAnalysis.ts
│   │   └── tradeExecution.ts
│   ├── tools/                # Tool implementations
│   │   ├── getPricePrediction.ts
│   │   ├── analyzeTradingOpportunity.ts
│   │   ├── executeTrade.ts
│   │   └── predictAndTradeWorkflow.ts
│   ├── hooks/                # Tool enhancements
│   └── utils/                # Shared utilities
│       ├── tokenRegistry.ts
│       └── riskAssessment.ts
```

## Testing Guide

For detailed testing instructions, see [TESTING_GUIDE.md](./TESTING_GUIDE.md).

For information about wallet requirements, see [WALLET_INFO.md](./WALLET_INFO.md).

## Frontend Integration

The agent can be accessed through the Vibekit web frontend for a better user experience. See [FRONTEND_INTEGRATION.md](./FRONTEND_INTEGRATION.md) for setup instructions.

Quick start with Docker:

```bash
cd ../../  # Navigate to typescript directory
docker compose up
```

Then access http://localhost:3000 and select "AI Trading" from the agent selector.
