# Ember Agent

A unified multi-skill DeFi agent supporting swapping, lending, liquidity provision, and Pendle operations on Arbitrum. Built using the Arbitrum Vibekit framework.

**📚 Learn the architecture**: This agent demonstrates advanced multi-skill patterns covered in [Lesson 19: Skills Foundation](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/lib/arbitrum-vibekit-core/docs/lesson-19.md), [Lesson 22: Decision Framework](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/lib/arbitrum-vibekit-core/docs/lesson-22.md), and [Lesson 16: Hook Enhancement](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/lib/arbitrum-vibekit-core/docs/lesson-16.md).

## Features

### Skills

- **Token Swapping** - Swap tokens via Camelot DEX
- **Lending Operations** - Supply, borrow, repay, withdraw via Aave
- **Liquidity Provision** - Add/remove liquidity on Camelot V3
- **Pendle Protocol** - PT/YT trading and market operations
- **Documentation Expert** - Protocol-specific documentation and Q&A

### Architecture

- **Skills-based**: Each capability is a separate skill with focused tools ([Lesson 19](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/lib/arbitrum-vibekit-core/docs/lesson-19.md))
- **LLM Orchestration**: AI automatically routes to appropriate tools ([Lesson 20](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/lib/arbitrum-vibekit-core/docs/lesson-20.md))
- **Hook Enhancement**: Before/after hooks for validation and formatting ([Lesson 16](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/lib/arbitrum-vibekit-core/docs/lesson-16.md))
- **Modern Transport**: StreamableHTTP with legacy SSE backwards compatibility ([Lesson 25](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/lib/arbitrum-vibekit-core/docs/lesson-25.md))
- **External Integration**: Connects to Ember MCP server for blockchain operations

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm (workspace package manager)
- Arbitrum RPC access
- AI provider API key (OpenRouter recommended)

### Installation

From the `typescript/` directory:

```bash
# Install dependencies
pnpm install

# Build the project
pnpm build

# Start the agent in development mode
pnpm dev -F ember-agent
```

### Environment Configuration

Create a `.env` file in the ember-agent directory with:

```bash
# Required: Arbitrum RPC endpoint
ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc

# Required: AI Provider (OpenRouter recommended)
OPENROUTER_API_KEY=your_openrouter_api_key_here

# Required: Ember MCP Server Configuration
EMBER_MCP_SERVER_URL=https://api.emberai.xyz/mcp

# Optional: Server configuration
PORT=3001
ENABLE_LEGACY_SSE_TRANSPORT=false
DEFAULT_USER_ADDRESS=0x...
```

### Alternative AI Providers

Instead of OpenRouter, you can use:

```bash
# OpenAI
OPENAI_API_KEY=your_openai_api_key_here

# Anthropic
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

## Usage

### Starting the Agent

```bash
# Development mode
pnpm dev

# Production mode
pnpm build && pnpm start

# Docker
pnpm docker:build && pnpm docker:run
```

### MCP Integration

The agent exposes an MCP server that can be integrated with MCP clients:

- **StreamableHTTP** (default): `http://localhost:3001/mcp`
- **SSE** (legacy): `http://localhost:3001/sse` (if enabled)

### Example Requests

```typescript
// Token swapping
{
  skill: "token-swapping",
  input: {
    instruction: "Swap 100 USDC for ETH",
    userAddress: "0x..."
  }
}

// Lending operations
{
  skill: "lending-operations",
  input: {
    instruction: "Supply 1000 USDC to Aave",
    userAddress: "0x..."
  }
}

// Documentation queries
{
  skill: "documentation",
  input: {
    question: "How does Camelot V3 liquidity work?"
  }
}
```

## Development

### Project Structure

```
src/
├── index.ts              # Main agent entry point
├── context/
│   ├── provider.ts       # Shared context provider
│   └── types.ts          # Context type definitions
├── skills/
│   ├── swapping.ts       # Token swapping skill
│   ├── lending.ts        # Lending operations skill
│   ├── liquidity.ts      # Liquidity provision skill
│   ├── pendle.ts         # Pendle protocol skill
│   └── documentation.ts  # Documentation expert skill
├── tools/
│   ├── swapTokens.ts     # Token swapping tool
│   ├── supply.ts         # Aave supply tool
│   ├── borrow.ts         # Aave borrow tool
│   └── ...               # Other protocol-specific tools
└── hooks/
    ├── index.ts          # Hook composition utilities
    ├── validation.ts     # Validation hooks
    ├── tokenResolution.ts # Token resolution hooks
    └── formatting.ts     # Response formatting hooks
```

### Testing

The project uses Vitest for testing:

```bash
# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests once (CI mode)
pnpm test:run
```

### Code Quality

```bash
# Format code
pnpm format

# Check formatting
pnpm format:check

# Lint (from workspace root)
pnpm recursive run lint
```

## Configuration

### Transport Options

- **StreamableHTTP** (default): Modern, efficient transport
- **SSE**: Legacy transport for backwards compatibility

Set `ENABLE_LEGACY_SSE_TRANSPORT=true` to enable both transports.

### AI Provider Selection

The agent automatically selects the best available provider:

1. OpenRouter (recommended - access to multiple models)
2. OpenAI (GPT models)
3. Anthropic (Claude models)

### Protocol Integration

Each skill connects to its respective protocol:

- **Swapping**: Camelot DEX on Arbitrum
- **Lending**: Aave V3 on Arbitrum
- **Liquidity**: Camelot V3 pools
- **Pendle**: Pendle protocol markets

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes following the existing patterns
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## License

MIT License - see LICENSE file for details.
