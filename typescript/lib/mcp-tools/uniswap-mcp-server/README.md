# Uniswap MCP Server

A production-grade Model Context Protocol (MCP) server for Uniswap token swaps, providing agents with comprehensive swap capabilities including quotes, routing, transaction generation, and feasibility validation.

## Overview

The Uniswap MCP Server enables AI agents to interact with Uniswap v2 and v3 liquidity pools through the Universal Router. It provides a complete suite of tools for:

- **Swap Quotes**: Get expected output amounts, price impact, and route summaries
- **Route Discovery**: Find optimal swap routes across Uniswap v2 and v3 pools
- **Transaction Generation**: Create executable transaction calldata for swaps
- **Feasibility Validation**: Check token validity, liquidity, balances, and approvals
- **Natural Language Processing**: Convert swap intents into structured swap plans

## Features

- ✅ Full support for Uniswap v2 and v3 via Universal Router
- ✅ Comprehensive input/output validation with Zod schemas
- ✅ Type-safe TypeScript implementation
- ✅ BigInt support for all uint256 values
- ✅ Strict address validation
- ✅ Deterministic pure functions where possible
- ✅ Centralized error handling with typed error classes
- ✅ Environment-based configuration
- ✅ Production-ready architecture

## Installation

```bash
cd typescript/lib/mcp-tools/uniswap-mcp-server
pnpm install
```

## Configuration

Create a `.env` file in the server directory:

```env
# Required: RPC URLs
ETHEREUM_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY
ARBITRUM_RPC_URL=https://arb-mainnet.g.alchemy.com/v2/YOUR_API_KEY

# Optional: Transaction signing (only needed for execution)
PRIVATE_KEY=0x...

# Optional: Defaults
DEFAULT_SLIPPAGE=0.5
GAS_MULTIPLIER=1.2
PORT=3012
```

## Usage

### As a Standalone Server

Start the server:

```bash
pnpm start
```

The server will be available at:
- HTTP: `http://localhost:3012/mcp`
- STDIO: Standard input/output for MCP clients

### As an MCP Tool Provider

The server exposes the following MCP tools:

#### `getSwapQuote`

Get a swap quote for a token pair.

**Input:**
```json
{
  "tokenIn": "0x...",
  "tokenOut": "0x...",
  "amount": "1000000000000000000",
  "chainId": 1,
  "slippageTolerance": 0.5
}
```

**Output:**
```json
{
  "expectedAmountOut": "2000000000",
  "priceImpact": "0.15",
  "routeSummary": {
    "hops": [...],
    "totalFee": "3000",
    "priceImpact": "0.15"
  },
  "effectivePrice": "0.0005",
  "minimumAmountOut": "1990000000"
}
```

#### `getBestRoute`

Discover the optimal swap route.

**Input:**
```json
{
  "tokenIn": "0x...",
  "tokenOut": "0x...",
  "amount": "1000000000000000000",
  "chainId": 1
}
```

#### `generateSwapTransaction`

Generate executable transaction calldata.

**Input:**
```json
{
  "route": {...},
  "amountIn": "1000000000000000000",
  "slippageTolerance": 0.5,
  "recipient": "0x...",
  "chainId": 1
}
```

**Output:**
```json
{
  "to": "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD",
  "data": "0x...",
  "value": "0",
  "gasEstimate": "200000",
  "deadline": 1234567890
}
```

#### `validateSwapFeasibility`

Validate swap feasibility before execution.

**Input:**
```json
{
  "tokenIn": "0x...",
  "tokenOut": "0x...",
  "amount": "1000000000000000000",
  "chainId": 1,
  "userAddress": "0x...",
  "slippageTolerance": 0.5
}
```

**Output:**
```json
{
  "isValid": true,
  "errors": [],
  "warnings": [],
  "requiresApproval": false,
  "userBalance": "5000000000000000000",
  "estimatedAmountOut": "2000000000"
}
```

#### `processSwapIntent`

Convert natural language swap intents into structured plans.

**Input:**
```json
{
  "intent": "Swap 1 ETH to USDC with minimal slippage",
  "chainId": 1,
  "userAddress": "0x..."
}
```

**Output:**
```json
{
  "tokenIn": "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
  "tokenOut": "0xA0b86991c6218b36c1d19D4a2e9Eb0c3606eB48",
  "amount": "1000000000000000000",
  "slippageTolerance": 0.5,
  "quote": {...},
  "transaction": {...},
  "validation": {...}
}
```

## Architecture

The server follows a clean, modular architecture:

```
src/
├── errors/          # Typed error classes
├── schemas/         # Zod schemas for validation
├── tools/           # MCP tool implementations
│   ├── getSwapQuote.ts
│   ├── getBestRoute.ts
│   ├── generateSwapTransaction.ts
│   ├── validateSwapFeasibility.ts
│   └── processSwapIntent.ts
├── utils/           # Shared utilities
│   ├── validation.ts
│   ├── chain-config.ts
│   ├── config.ts
│   ├── provider.ts
│   └── routing.ts
├── mcp.ts           # MCP server setup
└── index.ts         # Entry point
```

## Supported Chains

- Ethereum Mainnet (Chain ID: 1)
- Arbitrum One (Chain ID: 42161)
- Ethereum Sepolia (Chain ID: 11155111)
- Arbitrum Sepolia (Chain ID: 421614)

## Error Handling

The server uses typed error classes for clear error messages:

- `ValidationError`: Input validation failures
- `TokenError`: Token-related errors
- `RoutingError`: Route discovery failures
- `LiquidityError`: Insufficient liquidity
- `TransactionError`: Transaction generation errors
- `BalanceError`: Insufficient balance
- `ApprovalError`: Token approval issues
- `ConfigurationError`: Configuration problems

## Testing

Run tests:

```bash
pnpm test
```

Run tests in watch mode:

```bash
pnpm test:watch
```

## Development

Build the project:

```bash
pnpm build
```

Run in development mode:

```bash
pnpm dev
```

## Integration with Vibekit

To integrate this MCP server into a Vibekit agent, add it to your `mcp.json`:

```json
{
  "mcpServers": {
    "uniswap": {
      "command": "node",
      "args": ["path/to/uniswap-mcp-server/dist/index.js"],
      "env": {
        "ETHEREUM_RPC_URL": "...",
        "ARBITRUM_RPC_URL": "..."
      }
    }
  }
}
```

## License

ISC

