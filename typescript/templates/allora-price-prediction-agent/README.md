# Allora Price Prediction Agent

An AI agent that provides price predictions using Allora's prediction markets data through the Model Context Protocol (MCP).

**📚 Learn the concepts**: This agent demonstrates single-skill architecture from [Lesson 19: Skills Foundation](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/lib/arbitrum-vibekit-core/docs/lesson-19.md) and advanced hook patterns from [Lesson 16: Tool Enhancement](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/lib/arbitrum-vibekit-core/docs/lesson-16.md).

## Overview

The Allora Price Prediction Agent leverages the Arbitrum Vibekit framework to create an on-chain AI agent that can:

- Fetch price predictions for various tokens (BTC, ETH, etc.)
- Access Allora's prediction markets data
- Provide natural language responses to price prediction queries
- Use LLM orchestration for intelligent query handling

## Features

- **Single Skill Design**: Streamlined price prediction skill with LLM orchestration ([Lesson 19](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/lib/arbitrum-vibekit-core/docs/lesson-19.md))
- **Smart Token Mapping**: Automatically maps token symbols to Allora topic IDs
- **Hook-Based Architecture**: Clean separation of concerns using pre/post hooks ([Lesson 16](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/lib/arbitrum-vibekit-core/docs/lesson-16.md))
- **MCP Integration**: Direct integration with Allora MCP server via STDIO ([Lesson 2](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/lib/arbitrum-vibekit-core/docs/lesson-02.md))
- **Error Handling**: Comprehensive error handling for unknown tokens and API failures

## Architecture

### Skill: Price Prediction

The agent has one main skill:

- **pricePrediction**: Get price predictions for tokens from Allora markets
  - Input: Natural language message requesting price prediction
  - Process: LLM extracts token and timeframe, maps token to topic ID, fetches prediction, formats response
  - Output: Formatted price prediction with metadata

### Tool Design

The price prediction tool uses a hook-based approach ([Lesson 16](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/lib/arbitrum-vibekit-core/docs/lesson-16.md)):

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

   Create a `.env` file in this directory with your API keys:

   ```bash
   # .env
   # Option 1: OpenRouter (supports many models)
   OPENROUTER_API_KEY=your_openrouter_api_key

   # Option 2: OpenAI
   OPENAI_API_KEY=your_openai_api_key

   # Option 3: Grok (xAI)
   XAI_API_KEY=your_xai_api_key

   # Option 4: Hyperbolic
   HYPERBOLIC_API_KEY=your_hyperbolic_api_key
   ALLORA_API_KEY=your_allora_api_key
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

## Language Model Configuration

This agent is configured to use **OpenRouter** as its exclusive LLM provider. The integration is managed via `createProviderSelector` from `@arbitrum/vibekit-core` in `src/index.ts`.

The provider is initialized as follows:

```typescript
// src/index.ts
const providers = createProviderSelector({
  openRouterApiKey: process.env.OPENROUTER_API_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY,
  xaiApiKey: process.env.XAI_API_KEY,
  hyperbolicApiKey: process.env.HYPERBOLIC_API_KEY,
});
```

To use the agent, you must provide an `OPENROUTER_API_KEY` in your `.env` file. The agent will use this key to create the model instance for LLM-based orchestration.

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

| Variable             | Description                                                       | Required    |
| -------------------- | ----------------------------------------------------------------- | ----------- |
| `OPENROUTER_API_KEY` | OpenRouter API key                                                | Conditional |
| `OPENAI_API_KEY`     | OpenAI API key                                                    | Conditional |
| `XAI_API_KEY`        | Grok (xAI) API key                                                | Conditional |
| `HYPERBOLIC_API_KEY` | Hyperbolic API key                                                | Conditional |
| `ALLORA_API_KEY`     | Allora API key (required for price prediction data)               | Yes         |
| `AI_PROVIDER`        | Preferred provider (`openrouter`, `openai`, `grok`, `hyperbolic`) | No          |
| `AI_MODEL`           | Model override (e.g., `google/gemini-2.5-flash`)                  | No          |
| `PORT`               | Server port for the agent (default: 3008)                         | No          |
| `ALLORA_MCP_PORT`    | Port for the spawned Allora MCP server (default: 3009)            | No          |

### Port Configuration Note

When running with Docker Compose, be aware of port assignments:

- **3001**: Docker Compose Allora MCP server (if running separately)
- **3008**: Your agent's default port (configurable via `PORT` env var)
- **3009**: STDIO-spawned Allora MCP server port (configurable via `ALLORA_MCP_PORT`)

Always connect to your agent's port (default 3008) to access the price prediction functionality. The agent internally manages the Allora MCP server connection.

## Technical Details

- **Framework**: Arbitrum Vibekit Core
- **LLM Provider**: Vercel AI SDK (`createProviderSelector`)
- **MCP Integration**: Allora MCP server via STDIO
- **Language**: TypeScript
- **Runtime**: Node.js 20+

## Development

To modify or extend the agent:

1. **Add new tokens**: Update the token matching logic in `topicDiscoveryHook`
2. **Change formatting**: Modify the `formatResponseHook`
3. **Add features**: Extend the skill with new tools or capabilities

## License

[License information here]
