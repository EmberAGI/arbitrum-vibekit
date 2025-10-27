# @emberai/onchain-actions-registry

[![npm version](https://img.shields.io/npm/v/@emberai/onchain-actions-registry.svg)](https://www.npmjs.com/package/@emberai/onchain-actions-registry)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/LICENSE)

A modular plugin architecture for integrating DeFi protocols into the Ember ecosystem. Build custom protocol plugins with TypeScript support and comprehensive type safety.

## Installation

```bash
npm install @emberai/onchain-actions-registry
```

```bash
pnpm add @emberai/onchain-actions-registry
```

```bash
yarn add @emberai/onchain-actions-registry
```

## Overview

The Ember Plugin System consists of the following components:

```
onchain-actions-plugins/
└── registry/
    ├── src/
    │   ├── core/              # Type definitions, interfaces, and schemas for plugin development.
    │   ├── aave-lending-plugin/   #  Complete AAVE V3 lending plugin serving as a development example.
    │   ├── registry.ts        # Plugin registration and discovery system.
    │   ├── chainConfig.ts     # Chain configuration utilities
    │   └── index.ts           # Main registry initialization
    ├── package.json
    ├── tsconfig.json
    └── tsup.config.ts
```

### What are Plugins?

Plugins are capabilities that expand Ember's functionality by integrating new DeFi protocols. The plugin created by developers must handle all smart contract interactions, from constructing transaction calldata to managing protocol-specific logic. Once a plugin is finalized, updates will be made to Ember's backend to fully integrate the new capabilities.

### Why Build Plugins?

The plugin system provides several key advantages for protocol integrations:

1. **Provided Entity Mapping**: Standardized entity mapping ensures consistent data structures across all protocol integrations. Without standardized mapping, each protocol integration would require custom entity definitions, leading to inconsistent data structures and increased complexity when working across multiple protocols.

2. **Faster Protocol Integration**: Building protocol integrations from scratch is time-consuming and error-prone. The plugin system eliminates boilerplate code and provides patterns for common DeFi operations. The pre-built framework and type safety accelerates the integration of new DeFi protocols.

3. **Easier User Consumption and Aggregated/Optimized Results**: Users typically need to interact with each protocol separately, manually compare rates and liquidity, and piece together optimal strategies. The plugin system aggregates protocol data and enables intelligent routing across integrations. This unified interface allows users to interact with multiple protocols seamlessly, with aggregated data and optimized execution paths.

4. **Potential Trailblazer Incentive**: Plugin developers may be eligible for the [Trailblazer Fund 2.0](https://www.emberai.xyz/blog/introducing-arbitrum-vibekit-and-the-trailblazer-fund-2-0) initiative launched by Arbitrum.

### Information Flow

Here is how the system's components interact with each other:

<p align="left">
  <img src="../../../img/Plugin System.png" width="800px" alt="Plugin System Information Flow Diagram"/>
</p>

## Plugin Architecture

The core framework (`registry/src/core/`) provides the following components:

- **actions**: Action type definitions and interfaces for all plugin types
- **queries**: Query type definitions for retrieving protocol data
- **schemas**: Zod validation schemas for requests and responses
- **pluginType.ts**: Core plugin type definitions
- **index.ts**: Main exports for plugin development

These components work together to create a type-safe plugin system: **index.ts** defines the foundational `EmberPlugin` interface, while **pluginType.ts** defines the plugin types (lending, liquidity, swap, perpetuals) and maps each type to its available **actions** and **queries**. The **actions** directory provides the executable operations (supply, borrow, swap, etc.) with their callback signatures, while **queries** enable data retrieval without transactions. All inputs and outputs are validated through **schemas**, ensuring type safety and data consistency across the system.

### Plugin Interface

The core framework defines an `EmberPlugin<Type>` interface and each plugin must implement this interface:

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

Each plugin type defines specific [actions](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/onchain-actions-plugins/registry/src/core/actions) they can execute. For example, lending plugins can do `lending-supply`, `lending-borrow`, `lending-repay`, and `lending-withdraw`. Each action has callback functions that define its request and response.

```typescript
interface ActionDefinition<T extends Action> {
  name: string; // Unique action name
  type: T; // Action type
  callback: ActionCallback<T>; // Implementation function
  inputTokens: () => Promise<TokenSet[]>; // Supported input tokens
  outputTokens?: () => Promise<TokenSet[]>; // Optional output tokens
}
```

**Input Tokens**: The tokens that the user needs to execute this action. Token sets are organized by chain ID, and each action defines its own input/output token mapping.

**Output Tokens**: The tokens that the user receives through this action (optional field). Note that the function doesn't take all tokens, just transforms one of the supported input tokens into one of the supported output tokens.

#### Example: AAVE Lending Plugin Actions

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

The plugin system offers flexibility in action definitions. For example, AAVE defines multiple repay actions:

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

**Core Schemas** (`schemas/core.ts`):

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

The registry ([`registry.ts`](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/onchain-actions-plugins/registry/src/registry.ts)) manages plugin discovery and registration. You can initialize a registry using [`initializePublicRegistry()`](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/onchain-actions-plugins/registry/src/index.ts). The registry supports two distinct registration patterns:

### Deferred Registration (Recommended)

Use `registerDeferredPlugin()` for plugins requiring async initialization:

```typescript
// For plugins that need async setup (network calls, contract loading, etc.)
registry.registerDeferredPlugin(
  getAaveEmberPlugin({
    chainId: 42161,
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
    wrappedNativeToken: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
  }),
);
```

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

### Multiple Plugin Types from One Provider

While each plugin can only implement one type (lending, liquidity, swap, or perpetuals), protocol providers can create multiple plugins to support different capabilities:

```typescript
// Instead of returning one plugin, return a list of plugins
export async function getProtocolPlugins(
  params: ProtocolParams,
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
plugins.forEach((plugin) => {
  registry.registerPlugin(plugin);
});
```

## Currently Supported Protocols & Features

> **Note:**
> Before creating a new plugin, check if the functionality already exists in the Ember MCP server to avoid duplication.

The Ember MCP server already provides comprehensive support for the following protocols:

### Cross-Chain Swapping

- **Protocol**: DEX Aggregation across multiple chains
- **Capabilities**:
  - Cross-chain token swaps with routing optimization
  - Exact input/output amounts with slippage protection
  - Support for major DEXs including **Camelot DEX**
- **MCP Tools**: `createSwap`, `possibleSwaps`

### Perpetuals Trading

- **Protocol**: **GMX** and other perpetual DEXs
- **Capabilities**:
  - Long/short positions with customizable leverage
  - Limit orders, stop-loss, take-profit orders
  - Position and order management across protocols
  - Market data and liquidity information
- **MCP Tools**: `createPerpetualLongPosition`, `createPerpetualShortPosition`, `createClosePerpetualsOrders`, `getPerpetualsMarkets`, `getPerpetualsPositions`, `getPerpetualsOrders`

### Multi-Protocol Lending

- **Protocols**: **AAVE** and other major lending protocols
- **Capabilities**:
  - Supply tokens to earn yield across protocols
  - Borrow against collateral with rate optimization
  - Automated repayment and withdrawal strategies
  - Cross-protocol position management
- **MCP Tools**: `createLendingSupply`, `createLendingBorrow`, `createLendingRepay`, `createLendingWithdraw`, `getWalletLendingPositions`

### Multi-Protocol Liquidity

- **Protocols**: **Camelot DEX** and other AMMs
- **Capabilities**:
  - Add liquidity to pools across multiple DEXs
  - Remove liquidity with optimal timing
  - LP position tracking and management
  - Fee optimization across protocols
- **MCP Tools**: `createLiquiditySupply`, `createLiquidityWithdraw`, `getLiquidityPools`, `getWalletLiquidityPositions`

## Building Custom Plugins

The [`aave-lending-plugin`](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/onchain-actions-plugins/registry/src/aave-lending-plugin) serves as a comprehensive example that demonstrates the plugin implementation process. Use this plugin as your starting point. For a detailed development guide, see [`DEVELOPMENT.md`](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/typescript/onchain-actions-plugins/registry/DEVELOPMENT.md).

## License

MIT © [EmberAGI](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/LICENSE)

## Links

- [NPM Package](https://www.npmjs.com/package/@emberai/onchain-actions-registry)
- [GitHub Repository](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/onchain-actions-plugins/)
- [Ember Website](https://www.emberai.xyz/)
- [Ember X](https://x.com/EmberAGI)
