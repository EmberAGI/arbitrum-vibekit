# Ember Plugin System

The Ember Plugin System is a modular plugin architecture that enables developers to integrate DeFi protocols into the Ember ecosystem. This guide provides comprehensive instructions for building custom protocol plugins.

## Overview

The Ember Plugin System consists of the following components:

- **Core Framework** (`registry/src/core/`): Type definitions, interfaces, and schemas for plugin development.
- **Plugin Registry** (`registry/src/registry.ts`): Plugin registration and discovery system.
- **Reference Implementation** (`registry/src/aave-lending-plugin/`): Complete AAVE V3 lending plugin serving as a development example.

```
onchain-actions-plugins/
└── registry/
    ├── src/
    │   ├── core/              # Plugin framework and type definitions
    │   ├── aave-lending-plugin/   # Example AAVE protocol implementation
    │   ├── registry.ts        # Plugin registration system
    │   ├── chainConfig.ts     # Chain configuration utilities
    │   └── index.ts           # Main registry initialization
    ├── package.json
    ├── tsconfig.json
    └── tsup.config.ts
```

## `Core/` Component

The core framework provides:

- **actions**: Action type definitions and interfaces for all plugin types
- **queries**: Query type definitions for retrieving protocol data
- **schemas**: Zod validation schemas for requests and responses
- **pluginType.ts**: Core plugin type definitions
- **index.ts**: Main exports for plugin development

### Plugin Types

The core framework defines an `EmberPlugin<Type>` interface in `core/index.ts` with a generic `PluginType`. Each plugin must implement the `EmberPlugin<Type>` interface:

```typescript
interface EmberPlugin<Type extends PluginType> {
  id?: string; // Unique identifier
  type: Type; // Plugin type (lending, liquidity, swap, perpetuals)
  name: string; // Human-readable name
  description?: string; // Optional description
  website?: string; // Official website
  x?: string; // Twitter/X handle
  actions: ActionDefinition<AvailableActions[Type]>[]; // Available actions for this plugin type
  queries: AvailableQueries[Type]; // Data queries for this plugin type
}
```

The system supports four main plugin types:

- `lending`: Supply, borrow, repay, and withdraw operations
- `liquidity`: Add and remove liquidity from pools
- `swap`: Token exchange operations
- `perpetuals`: Long, short, and close perpetual positions

### Actions

Each plugin type defines specific [actions](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/onchain-actions-plugins/registry/src/core/actions) they can execute. For example, lending plugins can do `lending-supply` , `lending-borrow` ,`lending-repay`, and `lending-withdraw`. Each action has callback functions that define its request and response.

```typescript
interface ActionDefinition<T extends Action> {
  name: string; // Unique action name
  type: T; // Action type
  callback: ActionCallback<T>; // Implementation function
  inputTokens: () => Promise<TokenSet[]>; // Supported input tokens
  outputTokens?: () => Promise<TokenSet[]>; // Optional output tokens - if not provided, all input token sets will be considered possible output sets
}
```

**Input Tokens**: The tokens that the user needs to execute this action. Token sets are organized by chain ID, and each action defines its own input/output token mapping.

**Output Tokens**: The tokens that the user receives through this action (optional field). Note that the function doesn't take all tokens, just transforms one of the supported input tokens into one of the supported output tokens.

#### Example: AAVE Lending Plugin

```typescript
// First, fetch protocol data once at the function level
const reservesResponse = await adapter.getReserves();
const underlyingAssets = reservesResponse.reservesData.map(
  reserve => reserve.underlyingAsset
);
const aTokens = reservesResponse.reservesData.map(
  reserve => reserve.aTokenAddress
);
const borrowableAssets = reservesResponse.reservesData
  .filter(reserve => reserve.borrowingEnabled)
  .map(reserve => reserve.underlyingAsset);

// Supply Action: Transform underlying assets → aTokens
{
  type: 'lending-supply',
  name: `AAVE lending pools in chain ${adapter.chain.id}`,
  inputTokens: async () =>
    Promise.resolve([{
      chainId: adapter.chain.id.toString(),
      tokens: underlyingAssets,
    }]),
  outputTokens: async () =>
    Promise.resolve([{
      chainId: adapter.chain.id.toString(),
      tokens: aTokens,
    }]),
  callback: adapter.createSupplyTransaction.bind(adapter)
}

// Borrow Action: Use aTokens as collateral → borrow underlying assets
{
  type: 'lending-borrow',
  name: `AAVE borrow in chain ${adapter.chain.id}`,
  inputTokens: async () =>
    Promise.resolve([{
      chainId: adapter.chain.id.toString(),
      tokens: aTokens,
    }]),
  outputTokens: async () =>
    Promise.resolve([{
      chainId: adapter.chain.id.toString(),
      tokens: borrowableAssets,
    }]),
  callback: adapter.createBorrowTransaction.bind(adapter)
}
```

#### Flexible Action Definition

The plugin system offers flexibility in action definitions, so that plugins don't necessarily have to define all possible actions for their type or handle everything in one action.

**Example: AAVE Repay Actions**:

```typescript
// Repay Action #1: Repay with borrowed assets
{
  type: 'lending-repay',
  name: `AAVE repay in chain ${adapter.chain.id}`,
  inputTokens: async () =>
    Promise.resolve([{
      chainId: adapter.chain.id.toString(),
      tokens: borrowableAssets,
    }]),
  outputTokens: async () => Promise.resolve([]), // No output tokens
  callback: adapter.createRepayTransaction.bind(adapter)
}

// Repay Action #2: Repay with aTokens (collateral)
{
  type: 'lending-repay',
  name: `AAVE repay with aTokens in chain ${adapter.chain.id}`,
  inputTokens: async () =>
    Promise.resolve([{
      chainId: adapter.chain.id.toString(),
      tokens: aTokens,
    }]),
  outputTokens: async () => Promise.resolve([]), // No output tokens
  callback: adapter.createRepayTransactionWithATokens.bind(adapter)
}
```

### Queries

Each plugin type can define queries to retrieve protocol data without executing transactions:

```typescript
// Query interfaces by plugin type
type AvailableQueries = {
  lending: { getPositions: LendingGetPositions };
  liquidity: { getWalletPositions: LiquidityGetWalletPositions; getPools: LiquidityGetPools };
  swap: Record<string, never> | undefined; // No queries supported
  perpetuals: {
    getMarkets: PerpetualsGetMarkets;
    getPositions: PerpetualsGetPositions;
    getOrders: PerpetualsGetOrders;
  };
};
```

**Query examples:**

- Lending: Get user positions, health factors, and borrowing capacity
- Liquidity: Get wallet LP positions and available pools
- Perpetuals: Get markets, active positions, and pending orders
- Swap: No queries (stateless operations)

### Schema Architecture

The schema system provides comprehensive type safety with Zod validation:

**Core Schemas (`schemas/core.ts`)**:

- `TokenSchema`: Complete token metadata including native token handling
- `TransactionPlanSchema`: Standardized transaction format for all chains
- `FeeBreakdownSchema`: Service fees and slippage cost structure
- `BalanceSchema`: User wallet balance representation

**Action-Specific Schemas**:

- **Lending** (`schemas/lending.ts`): Supply, borrow, repay, withdraw operations with comprehensive position tracking
- **Liquidity** (`schemas/liquidity.ts`): Advanced liquidity provision with discriminated unions for full/limited range positions
- **Swap** (`schemas/swap.ts`): Token exchange with slippage tolerance and price tracking
- **Perpetuals** (`schemas/perpetuals.ts`): Integration with GMX SDK for complex derivatives trading

## Plugin Registry

The registry manages plugin discovery and registration with two distinct registration patterns:

### Deferred Registration (Recommended)

Use `registerDeferredPlugin()` for plugins requiring async initialization:

```typescript
// For plugins that need async setup (network calls, contract loading, etc.)
registry.registerDeferredPlugin(
  getAaveEmberPlugin({
    chainId: 42161,
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
    wrappedNativeToken: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
  })
);
```

**When to use:** Plugin creation involves network calls to fetch token lists or market data, heavy contract initialization, external API calls for configuration, or any async dependency resolution.

### Synchronous Registration

Use `registerPlugin()` for plugins that are already instantiated and ready to use:

```typescript
// For plugins that are already created and don't require async initialization
const instantPlugin = {
  type: 'lending',
  name: 'My Protocol',
  actions: [...],
  queries: {...}
};

registry.registerPlugin(instantPlugin);
```

**When to use:** Plugin creation is lightweight and doesn't involve async operations like network calls or heavy computation.

### Multiple Plugin Types from One Provider

While each plugin can only implement one type (lending, liquidity, swap, or perpetuals), protocol providers can create multiple plugins to support different capabilities:

```typescript
// Instead of returning one plugin, return a list of plugins
export async function getProtocolPlugins(
  params: ProtocolParams
): Promise<EmberPlugin<PluginType>[]> {
  return [
    // One plugin for lending
    {
      type: 'lending',
      name: 'Protocol Lending',
      actions: lendingActions,
      queries: lendingQueries,
    },
    // One plugin for swapping
    {
      type: 'swap',
      name: 'Protocol Swapping',
      actions: swapActions,
      queries: {},
    },
    // One plugin for perpetuals
    {
      type: 'perpetuals',
      name: 'Protocol Perpetuals',
      actions: perpetualsActions,
      queries: perpetualsQueries,
    },
  ];
}
```

Registry flexibility:

```typescript
// Instead of registering one plugin
registry.registerPlugin(plugin);

// Iterate over the list and register multiple plugins
const plugins = await getProtocolPlugins(params);
plugins.forEach(plugin => {
  registry.registerPlugin(plugin);
});
```

## Currently Supported Protocols & Features

> Note:
> Before creating a new plugin, check if the functionality already exists in the Ember MCP server to avoid duplication.

The Ember MCP server already provides comprehensive support for the following protocols and capabilities:

### Cross-Chain Swapping

- **Protocol**: DEX Aggregation across multiple chains
- **Capabilities**:
  - Cross-chain token swaps with routing optimization
  - Exact input/output amounts with slippage protection
  - Support for major DEXs including **Camelot DEX**
- **MCP Tools**: `createSwap`, `possibleSwaps`
- **No plugin needed**: Use existing MCP tools

### Perpetuals Trading

- **Protocol**: **GMX** and other perpetual DEXs
- **Capabilities**:
  - Long/short positions with customizable leverage
  - Limit orders, stop-loss, take-profit orders
  - Position and order management across protocols
  - Market data and liquidity information
- **MCP Tools**: `createPerpetualLongPosition`, `createPerpetualShortPosition`, `createClosePerpetualsOrders`, `getPerpetualsMarkets`, `getPerpetualsPositions`, `getPerpetualsOrders`
- **No plugin needed**: Use existing MCP tools

### Multi-Protocol Lending

- **Protocols**: **AAVE** and other major lending protocols
- **Capabilities**:
  - Supply tokens to earn yield across protocols
  - Borrow against collateral with rate optimization
  - Automated repayment and withdrawal strategies
  - Cross-protocol position management
- **MCP Tools**: `createLendingSupply`, `createLendingBorrow`, `createLendingRepay`, `createLendingWithdraw`, `getWalletLendingPositions`
- **No plugin needed**: Use existing MCP tools

### Multi-Protocol Liquidity

- **Protocols**: **Camelot DEX** and other AMMs
- **Capabilities**:
  - Add liquidity to pools across multiple DEXs
  - Remove liquidity with optimal timing
  - LP position tracking and management
  - Fee optimization across protocols
- **MCP Tools**: `createLiquiditySupply`, `createLiquidityWithdraw`, `getLiquidityPools`, `getWalletLiquidityPositions`
- **No plugin needed**: Use existing MCP tools

### Core Infrastructure

- **Chain Support**: Multi-chain operations across major networks
- **Wallet Integration**: Balance tracking and position management
- **Token Discovery**: Comprehensive token support with metadata
- **MCP Tools**: `getChains`, `getTokens`, `getWalletBalances`
- **No plugin needed**: Use existing MCP tools

## Plugin Development Guide

The [`aave-lending-plugin`](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/onchain-actions-plugins/registry/src/aave-lending-plugin) serves as a comprehensive example that demonstrates the plugin implementation process. Use this plugin as your starting point and reference implementation.

### Development Workflow

### 1. Planning and Setup

#### 1.1 Choose Your Plugin Type

Select the appropriate plugin type based on the DeFi protocol you're integrating:

- `lending`: Supply, borrow, repay, withdraw operations
- `liquidity`: Add and remove liquidity from pools
- `swap`: Token exchange operations
- `perpetuals`: Long, short, close perpetual positions

#### 1.2 Set Up Plugin Structure

Create a new directory in `onchain-actions-plugins/registry/src/` following the naming convention: `{protocol-name}-{type}-plugin`

```
onchain-actions-plugins/registry/src/your-protocol-plugin/
├── index.ts        # Main plugin export and registration
├── adapter.ts      # Protocol interaction logic
├── types.ts        # Protocol-specific types
├── chain.ts        # Chain-specific configurations
├── market.ts       # Protocol market configurations
├── dataProvider.ts # Data fetching utilities
├── userSummary.ts  # User position queries
├── errors.ts       # Protocol error handling
└── populateTransaction.ts # Transaction building utilities
```

### 2. Core Implementation

#### 2.1 Define Protocol Types and Market Configuration

Start by defining your protocol's core types and market configurations.

#### 2.2 Create Plugin Main Entry Point

```typescript
// src/your-protocol-plugin/index.ts
import type { ActionDefinition, EmberPlugin, LendingActions } from '../core/index.js';
import { YourProtocolAdapter, type YourProtocolAdapterParams } from './adapter.js';
import type { ChainConfig } from '../chainConfig.js';
import type { PublicEmberPluginRegistry } from '../registry.js';

export async function getYourProtocolPlugin(
  params: YourProtocolAdapterParams
): Promise<EmberPlugin<'lending'>> {
  const adapter = new YourProtocolAdapter(params);

  return {
    id: `YOUR_PROTOCOL_CHAIN_${params.chainId}`,
    type: 'lending',
    name: `Your Protocol lending for ${params.chainId}`,
    description: 'Your protocol V3 lending protocol',
    website: 'https://yourprotocol.com',
    x: 'https://x.com/yourprotocol',
    actions: await getYourProtocolActions(adapter),
    queries: {
      getPositions: adapter.getUserSummary.bind(adapter),
    },
  };
}

/**
 * Register the protocol plugin for the specified chain configuration.
 */
export function registerYourProtocol(
  chainConfig: ChainConfig,
  registry: PublicEmberPluginRegistry
) {
  const supportedChains = [42161]; // Add your supported chain IDs
  if (!supportedChains.includes(chainConfig.chainId)) {
    return;
  }

  registry.registerDeferredPlugin(
    getYourProtocolPlugin({
      chainId: chainConfig.chainId,
      rpcUrl: chainConfig.rpcUrl,
      wrappedNativeToken: chainConfig.wrappedNativeToken,
    })
  );
}
```

### 3. Action Definition and Implementation

#### 3.1 Available Action Types

Each plugin type has specific action types (as defined in core action files):

**Lending Plugin Actions** (`core/actions/lending.ts`):

- `lending-supply`, `lending-borrow`, `lending-repay`, `lending-withdraw`

**Liquidity Plugin Actions** (`core/actions/liquidity.ts`):

- `liquidity-supply`, `liquidity-withdraw`

**Swap Plugin Actions** (`core/actions/swap.ts`):

- `swap`

**Perpetuals Plugin Actions** (`core/actions/perpetuals.ts`):

- `perpetuals-long`, `perpetuals-short`, `perpetuals-close`

#### 3.2 Define Action Functions

Create action functions that return proper action definitions:

```typescript
// src/your-protocol-plugin/index.ts (part of getYourProtocolActions)
import type { ActionDefinition, LendingActions } from '../core/index.js';

async function getYourProtocolActions(
  adapter: YourProtocolAdapter
): Promise<ActionDefinition<LendingActions>[]> {
  // Dynamically fetch protocol data to get real token addresses
  const reservesResponse = await adapter.getReserves();

  // Extract real contract addresses from protocol
  const underlyingAssets: string[] = reservesResponse.reservesData.map(
    reserve => reserve.underlyingAsset
  );
  const yieldTokens: string[] = reservesResponse.reservesData.map(
    reserve => reserve.yTokenAddress // Protocol-specific yield token addresses (e.g., aTokenAddress for AAVE)
  );
  const borrowableAssets = reservesResponse.reservesData
    .filter(reserve => reserve.borrowingEnabled)
    .map(reserve => reserve.underlyingAsset);

  return [
    {
      type: 'lending-supply',
      name: `Your Protocol lending pools in chain ${adapter.chain.id}`,
      inputTokens: async () =>
        Promise.resolve([
          {
            chainId: adapter.chain.id.toString(),
            tokens: underlyingAssets,
          },
        ]),
      outputTokens: async () =>
        Promise.resolve([
          {
            chainId: adapter.chain.id.toString(),
            tokens: yieldTokens,
          },
        ]),
      callback: adapter.createSupplyTransaction.bind(adapter),
    },
    {
      type: 'lending-borrow',
      name: `Your Protocol borrow in chain ${adapter.chain.id}`,
      inputTokens: async () =>
        Promise.resolve([
          {
            chainId: adapter.chain.id.toString(),
            tokens: yieldTokens, // Use yield tokens as collateral
          },
        ]),
      outputTokens: async () =>
        Promise.resolve([
          {
            chainId: adapter.chain.id.toString(),
            tokens: borrowableAssets,
          },
        ]),
      callback: adapter.createBorrowTransaction.bind(adapter),
    },
    {
      type: 'lending-repay',
      name: `Your Protocol repay in chain ${adapter.chain.id}`,
      inputTokens: async () =>
        Promise.resolve([
          {
            chainId: adapter.chain.id.toString(),
            tokens: borrowableAssets,
          },
        ]),
      outputTokens: async () => Promise.resolve([]),
      callback: adapter.createRepayTransaction.bind(adapter),
    },
    {
      type: 'lending-withdraw',
      name: `Your Protocol withdraw in chain ${adapter.chain.id}`,
      inputTokens: async () =>
        Promise.resolve([
          {
            chainId: adapter.chain.id.toString(),
            tokens: yieldTokens,
          },
        ]),
      outputTokens: async () =>
        Promise.resolve([
          {
            chainId: adapter.chain.id.toString(),
            tokens: underlyingAssets,
          },
        ]),
      callback: adapter.createWithdrawTransaction.bind(adapter),
    },
  ];
}
```

#### 3.3 Protocol Adapter Implementation

Create an adapter class that handles protocol-specific logic:

```typescript
// src/your-protocol-plugin/adapter.ts
import { Chain } from './chain.js';
import { type YourProtocolMarket, getMarket } from './market.js';
import type {
  TransactionPlan,
  SupplyTokensRequest,
  SupplyTokensResponse,
  BorrowTokensRequest,
  BorrowTokensResponse,
  Token,
} from '../core/index.js';

export interface YourProtocolAdapterParams {
  chainId: number;
  rpcUrl: string;
  wrappedNativeToken?: string;
}

export class YourProtocolAdapter {
  public chain: Chain;
  public market: YourProtocolMarket;

  constructor(params: YourProtocolAdapterParams) {
    this.chain = new Chain(params.chainId, params.rpcUrl);
    this.market = getMarket(this.chain.id);
  }

  // Core transaction methods - implement your protocol-specific logic
  async createSupplyTransaction(params: SupplyTokensRequest): Promise<SupplyTokensResponse> {
    const txs = await this.supply(params.supplyToken, params.amount, params.walletAddress);
    return { transactions: txs.map(tx => this.transformToTransactionPlan(tx)) };
  }

  async createBorrowTransaction(params: BorrowTokensRequest): Promise<BorrowTokensResponse> {
    // Your protocol implementation
  }

  // Additional methods: createRepayTransaction, createWithdrawTransaction, getUserSummary, getReserves

  private async supply(token: Token, amount: bigint, user: string) {
    // Your protocol-specific supply logic here
    // Example: Use your protocol's SDK or direct contract calls
  }

  private transformToTransactionPlan(tx: PopulatedTransaction): TransactionPlan {
    // Transform ethers PopulatedTransaction to TransactionPlan format
  }
}
```

> **📖 Complete Implementation Reference**: See the [AAVE adapter](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/onchain-actions-plugins/registry/src/aave-lending-plugin/adapter.ts) for a full implementation example including all CRUD operations, error handling, transaction transformation, and protocol-specific logic patterns.

### 4. Registration and Integration

#### 4.1 Plugin Registry Integration

The registry manages plugin discovery and registration:

```typescript
// Register synchronous plugins
registry.registerPlugin(plugin);

// Register async plugins (recommended for heavy initialization)
registry.registerDeferredPlugin(pluginPromise);

// Iterate through all plugins
for await (const plugin of registry.getPlugins()) {
  console.log(`Loaded plugin: ${plugin.name}`);
}
```

#### 4.2 Add to Main Registry

Add your plugin to the main registry:

```typescript
// onchain-actions-plugins/registry/src/index.ts
import { registerYourProtocol } from './your-protocol-plugin/index.js';

export function initializePublicRegistry(chainConfigs: ChainConfig[]) {
  const registry = new PublicEmberPluginRegistry();

  // Register any plugin in here
  for (const chainConfig of chainConfigs) {
    // Register your protocol for each chain config
    registerYourProtocol(chainConfig, registry);
  }

  return registry;
}
```

### 5. Error Handling and Testing

#### 5.1 Error Handling

Implement robust error handling for your protocol:

```typescript
// Basic error handling pattern in adapter methods
async createSupplyTransaction(params: SupplyTokensRequest): Promise<SupplyTokensResponse> {
  try {
    // Input validation
    if (!params.amount || params.amount <= 0) {
      throw new Error('Invalid supply amount: must be greater than 0');
    }

    // Your protocol implementation
    const txs = await this.supply(params.supplyToken, params.amount, params.walletAddress);
    return { transactions: txs.map(tx => this.transformToTransactionPlan(tx)) };
  } catch (error) {
    throw new Error(`Supply failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
```

**Essential Error Scenarios to Handle:**

- Insufficient balance and invalid parameters
- Protocol-specific states (paused, frozen reserves)
- Health factor and liquidation thresholds
- Network and RPC failures

> **📖 Complete Error Handling Reference**: See the [AAVE error handling implementation](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/onchain-actions-plugins/registry/src/aave-lending-plugin/errors.ts) for comprehensive error codes, custom error classes, and protocol-specific error mapping patterns.

#### 5.2 Testing Your Plugin

Comprehensive testing ensures plugin reliability and successful integration. Follow this testing strategy:

**1. Unit Tests**

Test individual plugin functions with mocks:

```typescript
// test/adapter.test.ts
import { describe, it, expect, vi } from 'vitest';
import { YourProtocolAdapter } from '../src/adapter.js';

describe('YourProtocolAdapter', () => {
  it('should create valid supply transaction', async () => {
    const adapter = new YourProtocolAdapter({ chainId: 42161, rpcUrl: 'test' });
    vi.spyOn(adapter, 'supply').mockResolvedValue([{ to: '0xContract', data: '0x' }]);

    const result = await adapter.createSupplyTransaction({
      supplyToken: { address: '0xUSDC', symbol: 'USDC', decimals: 6 },
      amount: BigInt('1000000'),
      walletAddress: '0xUser',
    });

    expect(result.transactions).toHaveLength(1);
  });
});
```

**2. Integration Tests**

Test plugin registration and action validation:

```typescript
// test/integration.test.ts
import { getYourProtocolPlugin } from '../src/index.js';

describe('Plugin Integration', () => {
  it('should register plugin correctly', async () => {
    const plugin = await getYourProtocolPlugin({ chainId: 42161, rpcUrl: 'test' });
    expect(plugin.type).toBe('lending');
    expect(plugin.actions).toHaveLength(4);
  });
});
```

**Testing Best Practices:**

- Mock external dependencies (RPC calls, contract interactions)
- Test error scenarios and edge cases
- Use testnets for integration tests
- Validate transaction structure and token handling
- Test with realistic data volumes

## Integration with Ember MCP Server

Adding a new plugin to the Ember ecosystem might require coordination with the Ember team. If so, when creating a [protocol integration issue](https://github.com/EmberAGI/arbitrum-vibekit/issues/new?template=protocol_integration.yml), please include a note for the Ember team.

### Integration Requirements

1. **Plugin Development**: Complete your plugin implementation in this repository
2. **Testing**: Comprehensive testing including agent creation (see Testing section below)
3. **Documentation**: Update relevant documentation
4. **Ember Team Coordination**: The Ember team will handle the Plugin registration in the Ember server

### Unsupported Integration Needs

If what you're trying to integrate is not currently supported by the existing plugin architecture, create a [proposal issue](https://github.com/EmberAGI/arbitrum-vibekit/issues/new?template=protocol_integration.yml). Include in your proposal:

- What you want to integrate
- Why existing plugin types don't work
- What changes would your integration enable
- Why this integration would benefit the ecosystem

## Contributions

Please checkout our [contribution guidelines](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/CONTRIBUTIONS.md) to get started.
