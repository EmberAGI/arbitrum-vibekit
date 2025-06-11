# Allora Price Prediction Agent

An AI agent that provides price predictions using Allora's prediction markets data through the Model Context Protocol (MCP).

## Overview

The Allora Price Prediction Agent leverages the Arbitrum Vibekit framework to create an on-chain AI agent that can:

- Fetch price predictions for various tokens (BTC, ETH, etc.)
- Access Allora's prediction markets data
- Provide natural language responses to price prediction queries
- Use LLM orchestration for intelligent query handling

## Features

- **Single Skill Design**: Streamlined price prediction skill with LLM orchestration
- **Smart Token Mapping**: Automatically maps token symbols to Allora topic IDs
- **Hook-Based Architecture**: Clean separation of concerns using pre/post hooks
- **MCP Integration**: Direct integration with Allora MCP server via STDIO
- **Error Handling**: Comprehensive error handling for unknown tokens and API failures

## Architecture

### Skill: Price Prediction

The agent has one main skill:

- **pricePrediction**: Get price predictions for tokens from Allora markets
  - Input: Natural language message requesting price prediction
  - Process: LLM extracts token and timeframe, maps token to topic ID, fetches prediction, formats response
  - Output: Formatted price prediction with metadata

### Tool Design

The price prediction tool uses a hook-based approach:

1. **Pre-hook (Topic Discovery)**:

   - Calls `list_all_topics` from Allora MCP
   - Finds the topic ID matching the requested token
   - Adds topic ID to the tool arguments

2. **Main Tool Execution**:

   - Uses the discovered topic ID
   - Calls `get_inference_by_topic_id` from Allora MCP
   - Returns the price prediction data

3. **Post-hook (Response Formatting)**:
   - Formats the prediction data
   - Adds emojis and structure for better readability
   - Enhances the user experience

## Quick Start

1. **Install dependencies**:

   ```bash
   pnpm install
   ```

2. **Set up environment**:

   ```bash
   # Create .env file with:
   OPENROUTER_API_KEY=your_api_key_here
   ALLORA_API_KEY=your_allora_api_key_here  # Optional, uses default if not set
   ```

3. **Build the agent**:

   ```bash
   pnpm build
   ```

4. **Run in development**:
   ```bash
   pnpm dev
   ```

## Usage Examples

Once the agent is running, you can interact with it through the MCP interface:

```
"What is the BTC price prediction?"
"Get ETH price prediction for the next 8 hours"
"Show me the price prediction for Bitcoin"
"What will be the price of Ethereum?"
```

## Project Structure

```
allora-price-prediction-agent/
├── src/
│   ├── index.ts              # Agent configuration and startup
│   ├── skills/
│   │   └── pricePrediction.ts # Price prediction skill definition
│   ├── tools/
│   │   └── getPricePrediction.ts # Tool with hook integration
│   └── hooks/
│       └── pricePredictionHooks.ts # Pre/post hooks for tool
├── package.json
└── README.md
```

## Environment Variables

| Variable             | Description                                               | Required          |
| -------------------- | --------------------------------------------------------- | ----------------- |
| `OPENROUTER_API_KEY` | OpenRouter API key for LLM                                | Yes               |
| `ALLORA_API_KEY`     | Allora API key for predictions                            | No (uses default) |
| `PORT`               | Server port (default: 3008)                               | No                |
| `LLM_MODEL`          | LLM model name (default: google/gemini-2.5-flash-preview) | No                |
| `ALLORA_MCP_PORT`    | Port for STDIO-spawned Allora MCP server (default: 3009)  | No                |

### Port Configuration Note

When running with Docker Compose, be aware of port assignments:

- **3001**: Docker Compose Allora MCP server (if running separately)
- **3008**: Your agent's default port (configurable via `PORT` env var)
- **3009**: STDIO-spawned Allora MCP server port (configurable via `ALLORA_MCP_PORT`)

Always connect to your agent's port (default 3008) to access the price prediction functionality. The agent internally manages the Allora MCP server connection.

## Technical Details

- **Framework**: Arbitrum Vibekit Core
- **LLM Provider**: OpenRouter
- **MCP Integration**: Allora MCP server via STDIO
- **Language**: TypeScript
- **Runtime**: Node.js 18+

## Development

To modify or extend the agent:

1. **Add new tokens**: Update the token matching logic in `topicDiscoveryHook`
2. **Change formatting**: Modify the `formatResponseHook`
3. **Add features**: Extend the skill with new tools or capabilities

## License

[License information here]
