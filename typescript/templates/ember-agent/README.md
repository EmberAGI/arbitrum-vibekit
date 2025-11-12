# Ember Agent

A unified multi-skill DeFi agent supporting all EmberAI MCP tools such as swapping, lending, liquidity provision, perpetuals trading, and Pendle operations.

**📚 Learn the architecture**: This agent demonstrates advanced multi-skill patterns and workflows covered in [Lesson 28: Agent Node Framework](../../../docs/lesson-28.md).

## Features

### Skills

- **Token Swapping**: Swap tokens via Camelot DEX
- **Documentation Expert**: Protocol-specific documentation and Q&A
- **Lending Operations**: Supply, borrow, repay, withdraw via Aave (coming soon)
- **Liquidity Provision**: Add/remove liquidity on Camelot V3 (coming soon)
- **Pendle Protocol**: PT/YT trading and market operations (coming soon)
- **Perpetuals Trading**: GMX perpetuals trading operations such as creating long/short positions, managing orders, and querying markets (coming soon)

### Architecture

- **Skills-based**: Each capability is a separate skill with focused tools
- **LLM Orchestration**: AI automatically routes to appropriate tools
- **Hook Enhancement**: Before/after hooks for validation and formatting
- **Modern Transport**: A2A protocol with streaming support
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
│   └── documentation.ts  # Documentation expert skill
├── tools/
│   ├── swapTokens.ts     # Token swapping tool
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
