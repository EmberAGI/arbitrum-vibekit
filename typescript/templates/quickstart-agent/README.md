# Hello Quickstart Agent

A comprehensive example demonstrating **all v2 framework features** of the Arbitrum Vibekit Core framework. This agent serves as both an integration test and a developer template.

## Overview

The Hello Quickstart Agent showcases:

- **Multiple Skills**: LLM-orchestrated and manual handlers
- **Internal Tools**: Context-aware business logic tools
- **MCP Integration**: Multiple mock MCP servers
- **Hook System**: Tool enhancement with `withHooks`
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

   ```bash
   cp .env.example .env
   # Add your OPENROUTER_API_KEY
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
curl http://localhost:3002/
curl http://localhost:3002/.well-known/agent.json
```

## Environment Variables

| Variable             | Description                                 | Required |
| -------------------- | ------------------------------------------- | -------- |
| `OPENROUTER_API_KEY` | OpenRouter API key for LLM                  | Yes      |
| `PORT`               | Server port (default: 3002)                 | No       |
| `LLM_MODEL`          | LLM model name (default: gpt-4o-2024-08-06) | No       |
| `LOG_LEVEL`          | Logging level (default: debug)              | No       |

## Developer Notes

This agent is designed to be:

- **Feature Complete**: Tests every v2 capability
- **Minimal**: Simplest possible use of each feature
- **Self-Contained**: Includes mock MCP servers
- **Well-Documented**: Clear comments for each feature

Use this as a template for building your own agents!
