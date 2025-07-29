# Ember Schemas

TypeScript schemas and type definitions for the Ember API ecosystem, providing strongly-typed interfaces for DeFi operations using Zod validation schemas. For the TypeScript client that uses these schemas, see the [`ember-api`](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/lib/ember-api) package.

## Overview

This package contains all the Zod schemas, TypeScript types, and validation logic used across the Ember ecosystem for:

- **Request/Response validation**
- **Type safety**
- **Schema composition**
- **Runtime validation**

## Schema Categories

### Core Schemas (`common.ts`)

Fundamental building blocks used across all protocols:

- `TokenIdentifierSchema` - Token identification across chains
- `TransactionPlanSchema` - Transaction execution plans
- `AskEncyclopediaSchema` - Protocol documentation queries

### Lending Schemas (`lending.ts`)

Aave protocol lending and borrowing operations:

- `BorrowRepaySupplyWithdrawSchema` - Tool parameters for lending operations
- `SupplyResponseSchema`, `BorrowResponseSchema` - MCP response validation
- `LendingPositionSchema` - User position data structures

### Swapping Schemas (`swapping.ts`)

Cross-chain token swap operations:

- `SwapTokensArgsSchema` - Swap parameters and validation
- `SwapPreviewSchema` - Swap estimation data
- `SwapTokensTransactionArtifactSchema` - Transaction artifacts

### Liquidity Schemas (`liquidity.ts`)

Camelot DEX liquidity pool operations:

- `SupplyWithdrawLiquiditySchema` - Liquidity operation parameters
- `LiquidityPoolSchema` - Pool information structures
- `UserLiquidityPositionSchema` - LP position tracking

### Token & Balance Schemas (`token.ts`, `balance.ts`)

Token metadata and wallet balance operations:

- `TokenSchema` - Token information and metadata
- `GetMarketDataSchema` - Market data request parameters
- `GetWalletBalancesSchema` - Balance query structures

## Agent Tool Schemas

Each agent tool has corresponding parameter and response schemas:

**Tool Parameter Schemas** (validate agent inputs):

- `BorrowRepaySupplyWithdrawSchema` - lending operations
- `SupplyWithdrawLiquiditySchema` - liquidity operations
- `SwapTokensArgsSchema` - swapping operations
- `GetMarketDataSchema` - market data queries

**Response Schemas** (validate MCP responses):

- `SupplyResponseSchema`, `BorrowResponseSchema` - lending responses
- `SupplyLiquidityResponseSchema` - liquidity responses
- `SwapTokensResponseSchema` - swap responses
- `GetMarketDataResponseSchema` - market data responses

## Usage Patterns

### Runtime Validation

Validate user inputs and API responses at runtime:

```typescript
import { SwapTokensArgsSchema } from 'ember-schemas';

function handleSwapRequest(userInput: unknown) {
  try {
    const validatedInput = SwapTokensArgsSchema.parse(userInput);
    console.log(`Swapping ${validatedInput.amount} ${validatedInput.fromToken}`);
  } catch (error) {
    console.error('Invalid swap parameters:', error.message);
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
