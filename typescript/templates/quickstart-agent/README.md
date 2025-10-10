# Quickstart Agent

A comprehensive example demonstrating all features of the Arbitrum Vibekit Core framework.
You can use this agent as a template for building your own.

**📚 Learn the concepts**: Check out [Lesson 7: v2 Agent Structure and File Layout](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/lib/arbitrum-vibekit-core/docs/lesson-07.md), [Lesson 20: Skills - The v2 Foundation](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/lib/arbitrum-vibekit-core/docs/lesson-20.md), and [Lesson 21: LLM Orchestration vs Manual Handlers](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/lib/arbitrum-vibekit-core/docs/lesson-21.md) to understand the architecture demonstrated here.

## Overview

The Quickstart Agent showcases:

- **Multiple Skills**: LLM-orchestrated and manual handlers ([Lesson 21](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/lib/arbitrum-vibekit-core/docs/lesson-21.md))
- **Internal Tools**: Context-aware business logic tools
- **MCP Integration**: Multiple mock MCP servers ([Lesson 3](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/lib/arbitrum-vibekit-core/docs/lesson-03.md))
- **Hook System**: Tool enhancement with `withHooks` for validation and transaction signing ([Lesson 17](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/lib/arbitrum-vibekit-core/docs/lesson-17.md))
- **Context Management**: Custom context loading and type safety
- **Error Handling**: Comprehensive error scenarios
- **HTTP Endpoints**: Full REST API and MCP over SSE

### Skills

1. **greet** (LLM-orchestrated)

   - Takes name and greeting style
   - Uses multiple tools to generate personalized greetings
   - Demonstrates multi-step LLM execution

2. **getTime** (Manual handler)

   - Returns current time without LLM
   - Shows manual handler bypass pattern
   - Uses utility functions

3. **echo** (Manual handler with artifacts)
   - Echoes input with optional artifacts
   - Demonstrates error handling
   - Shows artifact creation

### Tools

- `getFormalGreeting`: Returns formal greetings
- `getCasualGreeting`: Returns casual greetings
- `getLocalizedGreeting`: Enhanced with timestamps via hooks
- `createEchoTool`: For echo skill
- `createArtifactTool`: For artifact creation

> **Important**: For blockchain transactions, always use `withHooks` after hooks to handle transaction signing and execution securely. See [Lesson 17](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/lib/arbitrum-vibekit-core/docs/lesson-17.md) for implementation details.

## Project Structure

```
quickstart/
├── src/
│   ├── index.ts           # Agent entry point
│   ├── skills/            # Skill definitions
│   ├── tools/             # Internal tool implementations
│   ├── hooks/             # Tool enhancement hooks
│   └── context/           # Context provider
├── mock-mcp-servers/      # Mock MCP server implementations
├── test/                  # Integration tests
└── package.json
```

## Environment Variables

| Variable             | Description                                                                                         | Required    |
| -------------------- | --------------------------------------------------------------------------------------------------- | ----------- |
| `OPENROUTER_API_KEY` | OpenRouter API key                                                                                  | Conditional |
| `OPENAI_API_KEY`     | OpenAI API key                                                                                      | Conditional |
| `XAI_API_KEY`        | Grok (xAI) API key                                                                                  | Conditional |
| `HYPERBOLIC_API_KEY` | Hyperbolic API key                                                                                  | Conditional |
| `AI_PROVIDER`        | Preferred AI provider (`openrouter`, `openai`, `grok`, `hyperbolic`). Defaults to first configured. | No          |
| `AI_MODEL`           | Override model name (e.g., `google/gemini-2.5-flash`). Defaults to provider's built-in default.     | No          |
| `PORT`               | Server port (default: 3007)                                                                         | No          |
| `LOG_LEVEL`          | Logging level (default: debug)                                                                      | No          |

## Quick Start

1. **Install dependencies**:

   ```bash
   pnpm install
   ```

2. **Set up environment**:

   Copy the provided `.env.example` template to `.env` and fill in your secrets. Edit .env with your provider API keys. At minimum, set one of OPENROUTER_API_KEY, OPENAI_API_KEY, XAI_API_KEY or HYPERBOLIC_API_KEY.

   ```
   cp .env.example .env
   ```

3. **Run in development**:

   ```bash
   pnpm dev
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
