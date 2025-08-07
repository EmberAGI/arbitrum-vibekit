# Ember Plugin System

The Ember Plugin System provides a standardized architecture for integrating DeFi protocols into Vibekit. This system supports swap, lending, and liquidity operations across multiple blockchain networks.

## Architecture Overview

The plugin system is built around several core components:

- **EmberPlugin Interface**: Defines the structure of a plugin with type-safe actions and queries
- **Plugin Types**: Categorizes plugins into specific DeFi operation types
- **Action Definitions**: Callback functions that implement specific protocol operations
- **Queries**: Metadata and position retrieval functions for different protocols
- **TokenSets**: Multi-chain token organization system

## Core Interfaces

### EmberPlugin Interface

```typescript
interface EmberPlugin<Type extends PluginType> {
  id?: string; // Optional unique identifier
  type: Type; // Plugin type (lending, liquidity, or swap)
  actions: ActionDefinition<AvailableActions[Type]>[]; // Type-safe actions based on plugin type
  queries: AvailableQueries[Type]; // Type-safe queries based on plugin type
  name: string; // Plugin display name
  description?: string; // Optional description
  x?: string; // Twitter/X URL
  website?: string; // Plugin website URL (optional)
}
```

### Plugin Types

```typescript
type PluginType = 'lending' | 'liquidity' | 'swap';

type AvailableActions = {
  lending: 'lending-borrow' | 'lending-repay' | 'lending-supply' | 'lending-withdraw';
  liquidity: 'liquidity-supply' | 'liquidity-withdraw';
  swap: 'swap';
};
```

### ActionDefinition Interface

```typescript
interface ActionDefinition<T extends Action> {
  name: string; // Unique action name within the plugin
  type: T; // The action type
  callback: ActionCallback<T>; // Function to execute when action is triggered
  inputTokens: () => Promise<TokenSet[]>; // Available input tokens for all chains
  outputTokens?: () => Promise<TokenSet[]>; // Available output tokens (defaults to input tokens if not provided)
}
```

### TokenSet Interface

```typescript
interface TokenSet {
  chainId: string; // The blockchain network ID
  tokens: string[]; // Array of token addresses for this chain
}
```

## Supported Action Types

### Swap Operations

**Action Type**: `swap`

```typescript
// Uses ember-schemas types
type SwapActionCallback = (request: SwapTokensRequest) => Promise<SwapTokensResponse>;
```

### Lending Operations

**Action Types**: `lending-borrow`, `lending-repay`, `lending-supply`, `lending-withdraw`

```typescript
// All use ember-schemas types for requests and responses
type LendingBorrowCallback = (request: BorrowTokensRequest) => Promise<BorrowTokensResponse>;
type LendingRepayTokensCallback = (request: RepayTokensRequest) => Promise<RepayTokensResponse>;
type LendingSupplyCallback = (request: SupplyTokensRequest) => Promise<SupplyTokensResponse>;
type LendingWithdrawCallback = (request: WithdrawTokensRequest) => Promise<WithdrawTokensResponse>;
```

### Liquidity Operations

**Action Types**: `liquidity-supply`, `liquidity-withdraw`

```typescript
// All use ember-schemas types for requests and responses
type LiquiditySupplyCallback = (
  request: SupplyLiquidityRequest
) => Promise<SupplyLiquidityResponse>;
type LiquidityWithdrawCallback = (
  request: WithdrawLiquidityRequest
) => Promise<WithdrawLiquidityResponse>;
```

## Plugin Queries

The plugin system now includes query capabilities for retrieving metadata and positions:

### Lending Queries

```typescript
type LendingQueries = {
  getPositions: (request: GetWalletLendingPositionsRequest) => Promise<LendingPosition>;
};
```

### Liquidity Queries

```typescript
type LiquidityQueries = {
  getWalletPositions: (
    request: GetWalletLiquidityPositionsRequest
  ) => Promise<GetWalletLiquidityPositionsResponse>;
  getPools: () => Promise<GetLiquidityPoolsResponse>;
};
```

### Swap Queries

Swap plugins currently do not require queries (empty interface).

## File Structure

```
typescript/lib/ember-plugin/
├── src/
│   ├── index.ts            # Main exports and EmberPlugin interface
│   ├── pluginType.ts       # Plugin types and type mappings
│   ├── common.ts           # Chain types and common interfaces
│   ├── actions/
│   │   ├── index.ts        # Action exports
│   │   ├── types.ts        # ActionDefinition and callback types
│   │   ├── swap.ts         # Swap action interfaces
│   │   ├── lending.ts      # Lending action interfaces
│   │   └── liquidity.ts    # Liquidity action interfaces
│   └── queries/
│       ├── index.ts        # Query exports
│       ├── lending.ts      # Lending query interfaces
│       └── liquidity.ts    # Liquidity query interfaces
├── package.json
├── tsconfig.json
└── README.md               # This file
```

## Key Changes and Features

1. **Type Safety**: The plugin system now uses generic types to ensure plugins only implement actions and queries relevant to their type
2. **Ember Schemas Integration**: All request/response types are now imported from the `ember-schemas` package for consistency
3. **Query System**: New query capabilities allow plugins to provide metadata and position information
4. **Simplified TokenSet**: TokenSet now uses string arrays for token addresses and chainId strings
5. **Plugin Categories**: Clear separation between lending, liquidity, and swap plugins with type-specific constraints

## Example Plugin Implementation

```typescript
import type { EmberPlugin } from 'ember-plugin';

const myLendingPlugin: EmberPlugin<'lending'> = {
  id: 'my-protocol',
  type: 'lending',
  name: 'My Protocol',
  description: 'A lending protocol plugin',
  website: 'https://myprotocol.com',
  actions: [
    {
      name: 'supply-usdc',
      type: 'lending-supply',
      callback: async (request) => {
        // Implementation
        return {
          /* SupplyTokensResponse */
        };
      },
      inputTokens: async () => [
        {
          chainId: '42161', // Arbitrum
          tokens: ['0xA0b86a33E6441fffFFFFFf00d3a81E6B18A6f14F'], // USDC
        },
      ],
    },
  ],
  queries: {
    getPositions: async (request) => {
      // Implementation
      return {
        /* LendingPosition */
      };
    },
  },
};
```

## Next Steps

1. **Study the Code**: Examine the source files in `src/` to understand the interfaces
2. **Implement Your Plugin**: Create action definitions for your target protocol
3. **Add Comprehensive Tests**: Follow the testing guidelines above
4. **Submit Your Contribution**: Create a pull request with your plugin implementation

For questions or support, create an issue in the [Vibekit repository](https://github.com/EmberAGI/arbitrum-vibekit/issues) or join our [Discord community](https://discord.com/invite/bgxWQ2fSBR).
