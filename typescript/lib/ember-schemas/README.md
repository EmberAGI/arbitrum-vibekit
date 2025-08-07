# Ember Schemas

TypeScript schemas and type definitions for the Ember API ecosystem, providing strongly-typed interfaces for DeFi operations using Zod validation schemas. For the TypeScript client that uses these schemas, see the [`ember-api`](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/lib/ember-api) package.

## Overview

This package contains all the Zod schemas, TypeScript types, and validation logic used across the Ember ecosystem for:

- **Agent tool parameter validation**
- **Agent response type safety**
- **AI-friendly schema composition**
- **Runtime validation for agent inputs**

## Endpoint

The Ember MCP server is hosted at the following URL:

```
https://api.emberai.xyz/mcp
```

## Schema Categories

### Core Schemas (`common.ts`)

Fundamental building blocks used across all protocols:

- `TokenIdentifierSchema` : Token identification across chains
- `TransactionPlanSchema` : Transaction execution plans
- `AskEncyclopediaSchema` : Protocol documentation queries

### Lending Schemas (`lending.ts`)

Aave protocol lending and borrowing operations:

- `BorrowRepaySupplyWithdrawSchema` : Tool parameters for lending operations
- `SupplyResponseSchema`, `BorrowResponseSchema`, `RepayResponseSchema`, `WithdrawResponseSchema` : MCP response validation
- `LendingPositionSchema` : User position data structures

### Swapping Schemas (`swapping.ts`)

Cross-chain token swap operations:

- `SwapTokensSchema` : Swap parameters and validation
- `SwapPreviewSchema` : Swap estimation data
- `SwapResponseSchema` : MCP response validation

### Liquidity Schemas (`liquidity.ts`)

Camelot DEX liquidity pool operations:

- `SupplyLiquiditySchema`, `WithdrawLiquiditySchema` : Liquidity operation parameters
- `LiquidityPoolSchema` : Pool information structures
- `LiquidityPositionArtifactSchema` : LP position tracking

### Pendle Schemas (`pendle.ts`)

Pendle yield and swap operations:

- `SwapTokensParamsSchema` : Swap parameters for Pendle protocol
- `PendleSwapPreviewSchema` : Human-readable swap preview data
- `YieldMarketSchema` : Yield market information structures

### Token & Balance Schemas (`token.ts`, `balance.ts`)

Token metadata and wallet balance operations:

- `TokenSchema` : Token information and metadata
- `GetMarketDataSchema` : Market data request parameters
- `GetWalletBalancesSchema` : Balance query structures

## Agent Tool Schemas

Each agent tool has corresponding parameter and response schemas:

**Tool Parameter Schemas** (validate agent inputs):

- `BorrowRepaySupplyWithdrawSchema` : lending operations
- `SupplyLiquiditySchema`, `WithdrawLiquiditySchema` : liquidity operations
- `SwapTokensSchema` : swapping operations
- `GetMarketDataSchema` : market data queries

**Response Schemas** (validate MCP responses):

- `SupplyResponseSchema`, `BorrowResponseSchema`, `RepayResponseSchema`, `WithdrawResponseSchema` : lending responses
- `SwapResponseSchema` : swap responses
- `GetMarketDataResponseSchema` : market data responses

## Usage Patterns

### Runtime Validation

Validate user inputs and API responses at runtime:

```typescript
import { SwapTokensSchema } from 'ember-schemas';

function handleSwapRequest(userInput: unknown) {
  try {
    const validatedInput = SwapTokensSchema.parse(userInput);
    console.log(`Swapping ${validatedInput.amount} ${validatedInput.fromToken}`);
  } catch (error) {
    console.error('Invalid swap parameters:', (error as Error).message);
  }
}
```

### Type Inference

Generate TypeScript types from schemas:

```typescript
import { type SwapTokensArgs, type LendingPosition } from 'ember-schemas';

function processSwap(params: SwapTokensArgs): Promise<void> {
  // params is fully typed with IntelliSense support
}

function displayPosition(position: LendingPosition): string {
  return `Health Factor: ${position.healthFactor}`;
}
```

### MCP Tool Integration

Use with MCP tool implementations:

```typescript
import { parseMcpToolResponsePayload } from 'arbitrum-vibekit-core';
import { SupplyResponseSchema } from 'ember-schemas';

const mcpResult = await mcpClient.callTool({
  name: 'supply',
  arguments: {
    /* ... */
  },
});

// Safely parse and validate the response
const supplyResponse = parseMcpToolResponsePayload(mcpResult, SupplyResponseSchema);
```

## Adding New Schemas

When adding support for new protocols:

1. Create protocol-specific schema file (e.g., `newProtocol.ts`)
2. Define request/response schemas with Zod
3. Export types using `z.infer<typeof Schema>`
4. Add exports to `index.ts`
5. Update this README
