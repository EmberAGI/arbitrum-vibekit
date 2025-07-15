# Ember Plugin System

The Ember Plugin System provides a standardized architecture for integrating DeFi protocols into Vibekit. This system supports swap, lending, and liquidity operations across multiple blockchain networks.

## Architecture Overview

The plugin system is built around several core components:

- **EmberPlugin Interface**: Defines the structure of a plugin
- **Action Definitions**: Callback functions that implement specific protocol operations
- **Action Types**: Predefined categories for different DeFi operations
- **TokenSets**: Multi-chain token organization system

## Core Interfaces

### EmberPlugin Interface

```typescript
interface EmberPlugin {
  actions: ActionDefinition<Action>[]; // Array of supported actions
  name: string; // Plugin display name
  description?: string; // Optional description
  x?: string; // Twitter/X URL
  website: string; // Plugin website URL
}
```

### ActionDefinition Interface

```typescript
interface ActionDefinition<T extends Action> {
  type: T; // The action type
  callback: ActionCallback<T>; // Function to execute when action is triggered
  inputTokens: () => Promise<TokenSet[]>; // Available input tokens for all chains
  outputTokens?: () => Promise<TokenSet[]>; // Available output tokens (optional)
}
```

### TokenSet Interface

```typescript
interface TokenSet {
  chain: Chain; // The blockchain network
  tokens: Set<Token>; // Set of tokens for this chain
}
```

## Supported Action Types

### Swap Operations

**Action Type**: `swap`

```typescript
interface SwapActionRequest {
  fromToken: TokenIdentifier;
  toToken: TokenIdentifier;
  amount: string; // Human-readable format
  walletAddress?: string;
}

type SwapActionCallback = (request: SwapActionRequest) => Promise<SwapResponse>;
```

### Lending Operations

**Action Types**: `lending-borrow`, `lending-repay`, `lending-supply`, `lending-withdraw`

```typescript
interface LendingInteractionRequest {
  token: TokenIdentifier;
  amount: string; // Human-readable format
  walletAddress: string;
}

// Callback types for each lending operation
type LendingBorrowCallback = (request: LendingInteractionRequest) => Promise<BorrowResponse>;
type LendingRepayTokensCallback = (request: LendingInteractionRequest) => Promise<RepayResponse>;
type LendingSupplyCallback = (request: LendingInteractionRequest) => Promise<SupplyResponse>;
type LendingWithdrawCallback = (request: LendingInteractionRequest) => Promise<WithdrawResponse>;
```

### Liquidity Operations

**Action Types**: `liquidity-supply`, `liquidity-withdraw`

```typescript
type LiquiditySupplyCallback = (request: SupplyLiquidityArgs) => Promise<LiquidityTransactionArtifact>;

interface LiquidityWithdrawResponse {
  transactions: TransactionPlan[];
  chainId: string;
}

type LiquidityWithdrawCallback = (request: WithdrawLiquidityArgs) => Promise<LiquidityWithdrawResponse>;
```


## File Structure

```
typescript/lib/ember-plugin/
├── src/
│   ├── plugin.ts           # Core EmberPlugin interface
│   ├── common.ts           # Chain and common types
│   ├── actions/
│   │   ├── index.ts        # Action exports
│   │   ├── types.ts        # ActionDefinition and callback types
│   │   ├── swap.ts         # Swap action interfaces
│   │   ├── lending.ts      # Lending action interfaces
│   │   └── liquidity.ts    # Liquidity action interfaces
│   └── index.ts            # Main exports
├── package.json
├── tsconfig.json
└── README.md               # This file
```

## Next Steps

1. **Study the Code**: Examine the source files in `src/` to understand the interfaces
2. **Implement Your Plugin**: Create action definitions for your target protocol
3. **Add Comprehensive Tests**: Follow the testing guidelines above
4. **Submit Your Contribution**: Create a pull request with your plugin implementation

For questions or support, create an issue in the [Vibekit repository](https://github.com/EmberAGI/arbitrum-vibekit/issues) or join our [Discord community](https://discord.com/invite/bgxWQ2fSBR). 