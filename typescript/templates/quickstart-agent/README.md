# Hello Quickstart Agent

A comprehensive example demonstrating **all v2 framework features** of the Arbitrum Vibekit Core framework. This agent serves as both an integration test and a developer template.

**📚 Learn the concepts**: New to the v2 framework? Check out [Lesson 6: Agent Structure](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/lib/arbitrum-vibekit-core/docs/lesson-06.md), [Lesson 19: Skills Foundation](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/lib/arbitrum-vibekit-core/docs/lesson-19.md), and [Lesson 20: LLM Orchestration](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/lib/arbitrum-vibekit-core/docs/lesson-20.md) to understand the architecture demonstrated here.

## Overview

The Hello Quickstart Agent showcases:

- **Multiple Skills**: LLM-orchestrated and manual handlers ([Lesson 20](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/lib/arbitrum-vibekit-core/docs/lesson-20.md))
- **Internal Tools**: Context-aware business logic tools
- **MCP Integration**: Multiple mock MCP servers ([Lesson 2](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/lib/arbitrum-vibekit-core/docs/lesson-02.md))
- **Hook System**: Tool enhancement with `withHooks` ([Lesson 16](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/lib/arbitrum-vibekit-core/docs/lesson-16.md))
- **Context Management**: Custom context loading and type safety
- **Error Handling**: Comprehensive error scenarios
- **HTTP Endpoints**: Full REST API and MCP over SSE

## Features Demonstrated

### Core v2 Features

- ✅ LLM orchestration with skill-specific prompts
- ✅ Manual skill handlers that bypass LLM
- ✅ Context-aware tools with strong typing
- ✅ Multiple MCP servers per skill
- ✅ Hook-based tool enhancement
- ✅ Artifact creation and management
- ✅ Comprehensive error handling with VibkitError
- ✅ Environment variable configuration

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

- `getFormalGreeting` - Returns formal greetings
- `getCasualGreeting` - Returns casual greetings
- `getLocalizedGreeting` - Enhanced with timestamps via hooks
- `createEchoTool` - For echo skill
- `createArtifactTool` - For artifact creation

### Mock MCP Servers

- `mock-mcp-translate` - Translation services
- `mock-mcp-language` - Supported languages
- `mock-mcp-time` - Timezone support

## Quick Start

1. **Install dependencies**:

   ```bash
   pnpm install
   ```

2. **Set up environment**:

   # (Optional) Copy the provided `.env.example` template to `.env` and fill in your secrets.

   cp .env.example .env

   # Edit .env with your provider API keys. At minimum, set one of OPENROUTER_API_KEY, OPENAI_API_KEY, XAI_API_KEY or HYPERBOLIC_API_KEY.

   ```

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
│   ├── tools/             # Internal tool implementations
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

## Developer Notes

This agent is designed to be:

- **Feature Complete**: Tests every v2 capability
- **Minimal**: Simplest possible use of each feature
- **Self-Contained**: Includes mock MCP servers
- **Well-Documented**: Clear comments for each feature

Use this as a template for building your own agents!
