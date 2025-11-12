# Quickstart Agent (Legacy Framework)

A comprehensive example demonstrating all features of the legacy Arbitrum Vibekit Core framework.
You can use this agent as a template for building your own with the older framework.

> **⚠️ Important**: This agent uses the **legacy framework** (`@emberai/arbitrum-vibekit-core`), not the modern Agent Node framework. For the latest framework, see [Agent Node](../../../lib/agent-node/README.md).

**📚 Learn the concepts**:

- **Legacy Framework**: This agent demonstrates the older programmatic approach
- **Modern Framework**: Check out [Lesson 28: Agent Node Framework](../../../docs/lesson-28.md) for the new config-driven Agent Node architecture

## Overview

The Quickstart Agent showcases **legacy framework features**:

- **Multiple Skills**: LLM-orchestrated and manual handlers using `defineSkill()`
- **Internal Tools**: Context-aware business logic tools
- **MCP Integration**: Multiple mock MCP servers with programmatic configuration
- **Hook System**: Tool enhancement with hooks for validation and transaction signing
- **Context Management**: Custom context loading and type safety
- **Error Handling**: Comprehensive error scenarios
- **HTTP Endpoints**: Full REST API and MCP over SSE
- **Programmatic Setup**: TypeScript-based agent configuration (vs. config-driven in Agent Node)

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

> **Important**: For blockchain transactions, always use hooks to handle transaction signing and execution securely.

## Project Structure

**Legacy Framework Structure** (programmatic approach):

```
quickstart/
├── src/
│   ├── index.ts           # Agent entry point (legacy Agent.create())
│   ├── skills/            # Skill definitions (defineSkill() objects)
│   ├── tools/             # Internal tool implementations
│   ├── hooks/             # Tool enhancement hooks
│   └── context/           # Context provider
├── mock-mcp-servers/      # Mock MCP server implementations
├── test/                  # Integration tests
└── package.json           # Uses @emberai/arbitrum-vibekit-core
```

**Note**: This differs from the modern Agent Node framework, which uses:

- Config-driven workspace (`config/` directory)
- Markdown-based skill definitions
- File-based agent configuration

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

   Create a `.env` file with your provider API keys. At minimum, set one of OPENROUTER_API_KEY, OPENAI_API_KEY, XAI_API_KEY or HYPERBOLIC_API_KEY.

   ```bash
   # Create .env file with your API keys
   echo "OPENROUTER_API_KEY=your_key_here" > .env
   # Add other provider keys as needed

   # Or copy from example
   cp .env.example .env
   # Then edit .env with your actual API keys
   ```

3. **Run in development**:

   ```bash
   pnpm dev
   ```

## Testing

The integration test suite validates all **legacy framework** features:

```bash
# Run full integration test (uses Mocha)
pnpm test

# Test specific endpoints
curl http://localhost:3007/
curl http://localhost:3007/.well-known/agent.json
```

## Migration Path

If you want to use the modern Agent Node framework instead:

1. **Use Agent Node**: See [Agent Node README](../../../lib/agent-node/README.md)
2. **Learn the new approach**: Check [Lesson 28](../../../docs/lesson-28.md)
3. **Start with**: `agent init my-agent` to create a config-driven workspace
