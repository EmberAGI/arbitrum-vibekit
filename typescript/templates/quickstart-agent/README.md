# Hello Quickstart Agent

A comprehensive example demonstrating **all v2 framework features** of the Arbitrum Vibekit Core framework with **Allora prediction market integration**. This agent serves as both an integration test and a developer template.

## Overview

The Hello Quickstart Agent showcases:

- **Multiple Skills**: LLM-orchestrated prediction skill and manual handlers
- **Allora MCP Integration**: Real-world MCP server for prediction market data
- **Context Management**: Custom context loading and type safety
- **Error Handling**: Comprehensive error scenarios
- **HTTP Endpoints**: Full REST API and MCP over SSE

## Features Demonstrated

### Core v2 Features

- ✅ LLM orchestration with skill-specific prompts
- ✅ Manual skill handlers that bypass LLM
- ✅ Context-aware execution with strong typing
- ✅ Real MCP server integration (Allora)
- ✅ Artifact creation and management
- ✅ Comprehensive error handling with VibkitError
- ✅ Environment variable configuration

### Skills

1. **prediction** (LLM-orchestrated with Allora)

   - Access Allora network predictions and market insights
   - List all available prediction topics
   - Get specific topic predictions
   - Analyze prediction data with confidence metrics
   - Demonstrates real-world MCP integration

2. **getTime** (Manual handler)

   - Returns current time without LLM
   - Shows manual handler bypass pattern
   - Uses utility functions

3. **echo** (Manual handler with artifacts)
   - Echoes input with optional artifacts
   - Demonstrates error handling
   - Shows artifact creation

### Allora MCP Tools

The prediction skill has access to Allora prediction market tools:

- `list_prediction_topics` - Lists all available prediction/inference topics
- `get_prediction_inference` - Fetches prediction data for a specific topic
- `analyze_predictions` - Analyzes prediction data and provides insights

### MCP Integration

- **Allora MCP Server**: Provides real-time access to prediction market data via:
  - `list_all_topics` - Raw topic listing from Allora
  - `get_inference_by_topic_id` - Raw inference data from Allora

### Mock MCP Servers

- `mock-mcp-time` - Timezone support (used by getTime skill)

## Quick Start

1. **Install dependencies**:

   ```bash
   pnpm install
   ```

2. **Set up environment**:

   ```bash
   cp .env.example .env
   # Add your OPENROUTER_API_KEY
   # Optionally add your ALLORA_API_KEY (defaults to test key)
   ```

3. **Run in development**:

   ```bash
   pnpm dev
   ```

4. **Run tests**:
   ```bash
   pnpm test
   ```

## Project Structure

```
quickstart/
├── src/
│   ├── index.ts           # Agent entry point
│   ├── skills/            # Skill definitions
│   ├── tools/             # Tool implementations
│   ├── hooks/             # Tool enhancement hooks
│   └── context/           # Context provider
├── mock-mcp-servers/      # Mock MCP server implementations
├── test/                  # Integration tests
└── package.json
```

## Testing

The integration test suite validates all framework features:

```bash
# Run full integration test
pnpm test

# Test specific endpoints
curl http://localhost:3007/
curl http://localhost:3007/.well-known/agent.json
```

## Environment Variables

| Variable             | Description                                 | Required |
| -------------------- | ------------------------------------------- | -------- |
| `OPENROUTER_API_KEY` | OpenRouter API key for LLM                  | Yes      |
| `ALLORA_API_KEY`     | Allora API key for prediction data          | No*      |
| `PORT`               | Server port (default: 3007)                 | No       |
| `LLM_MODEL`          | LLM model name (default: gpt-4o-2024-08-06) | No       |
| `LOG_LEVEL`          | Logging level (default: debug)              | No       |

*Defaults to a test API key if not provided

## Developer Notes

This agent is designed to be:

- **Feature Complete**: Tests every v2 capability
- **Real-World Integration**: Uses actual Allora MCP server for predictions
- **Self-Contained**: Includes mock MCP servers for other features
- **Well-Documented**: Clear comments for each feature

Use this as a template for building your own agents with real MCP integrations!

## Example Usage

### List Available Predictions

```
User: "Show me all available prediction topics"

Agent: "I've fetched the available prediction topics from Allora. Here are the current topics:
- Topic 1: ETH/USD price prediction (24h)
- Topic 2: BTC dominance forecast
- Topic 3: Total DeFi TVL predictions
- Topic 4: Gas price predictions
..."
```

### Get Specific Prediction

```
User: "Get the latest prediction for topic 1"

Agent: "Here's the latest ETH/USD prediction from topic 1:
- Current prediction: $3,245.67
- Confidence: 87.3%
- Time horizon: 24 hours
- Last updated: 2 minutes ago"
```

### Analyze Predictions

```
User: "Analyze the confidence levels for crypto predictions"

Agent: "Analysis of crypto prediction confidence levels:
- High confidence (>80%): ETH/USD, BTC/USD price predictions
- Medium confidence (60-80%): DeFi TVL, Gas prices
- Market volatility is currently moderate
- Prediction accuracy has been 92% over the last 7 days"
```
