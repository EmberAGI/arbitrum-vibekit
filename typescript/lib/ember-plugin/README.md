# Ember Plugin System

The Ember Plugin System provides a standardized way to integrate DeFi protocols with Vibekit. It supports protocols with swap, lending, and liquidity capabilities by letting you define what actions your protocol can perform. Once your plugin is created, it can be integrated with Vibekit agents through the MCP (Model Context Protocol) system. The plugin actions become available as tools that agents can use to interact with your protocol.

> **Note**: The plugin integration mechanism is currently under development. While you can create plugins using this structure, the automatic discovery and registration system is still being built.

## Overview

The plugin architecture is built around four core concepts:

1. **EmberPluginFactory**: The main class for creating plugins
2. **Action Definitions**: Simple descriptions of what your plugin can do
3. **Action Types**: Predefined categories for different DeFi operations
4. **Callbacks**: Implementation functions that execute the actual protocol interactions

The system supports multi-chain protocols via `TokenSet` objects that associate tokens with specific blockchain networks.

## Dependencies

The ember-plugin package depends on:

- `ember-schemas`: Provides common type definitions and interfaces
- `zod`: For runtime type validation

## Plugin Factory API

The `EmberPluginFactory` is the main class you'll use to create and manage your plugin. You need to create and export an instance of EmberPluginFactory from your plugin package. Here's how to use it:

### Constructor

```typescript
new EmberPluginFactory(
  name: string,           // Plugin name
  description?: string,   // Optional description
  x?: string,            // Optional X/Twitter handle
  website: string = '0.1.0' // Version (defaults to '0.1.0')
)
```

### Methods

- **addAction<T extends Action>(definition: ActionDefinition<T>): void**

  Registers an action with the plugin

- **getActions(): ActionDefinition<Action>[]**

  Returns all registered actions

## Creating a Plugin

To create a plugin, you need to define what your protocol can do (actions), implement the functions that execute those actions, and register them with the plugin factory. Here's a simple example:

```typescript
import { EmberPluginFactory, ChainType } from 'ember-plugin';
import type { ActionDefinition, Chain, TokenSet } from 'ember-plugin';

// Create your plugin
const myPlugin = new EmberPluginFactory('My Protocol Plugin', 'Integrates My Protocol with Ember');

// Define a chain your protocol supports
const arbitrumChain: Chain = {
  chainId: '42161',
  type: ChainType.EVM,
  name: 'Arbitrum One',
  iconUri: 'https://...',
  httpRpcUrl: 'https://...',
  blockExplorerUrls: ['https://arbiscan.io'],
};

// Define an action
const swapAction: ActionDefinition<'swap'> = {
  type: 'swap',
  callback: async (request) => {
    // Your swap implementation
    return await executeSwap(request);
  },
  inputTokens: async () => {
    // Return available token sets organized by chain
    return [
      {
        id: 'arbitrum-tokens',
        chain: arbitrumChain,
        tokens: new Set([
          { symbol: 'USDC', address: '0x...', decimals: 6 },
          { symbol: 'WETH', address: '0x...', decimals: 18 },
        ]),
      },
    ];
  },
  outputTokens: async () => {
    // Return possible output token sets
    return [
      {
        id: 'arbitrum-tokens', // Same ID indicates same token set
        chain: arbitrumChain,
        tokens: new Set([
          { symbol: 'USDC', address: '0x...', decimals: 6 },
          { symbol: 'WETH', address: '0x...', decimals: 18 },
        ]),
      },
    ];
  },
};

// Register the action
myPlugin.addAction(swapAction);

export default myPlugin;
```

## Action Types

The plugin system currently supports the following action types across multiple blockchain networks:

### Swap Actions

- **Type**: `'swap'`
- **Purpose**: Token exchange operations
- **Request Interface**: `SwapActionRequest`
- **Response Interface**: `SwapResponse`

### Lending Actions

- **Type**: `'lending-supply'`, `'lending-borrow'`, `'lending-repay'`, `'lending-withdraw'`
- **Purpose**: Lending protocol interactions
- **Request Interface**: `LendingInteractionRequest`
- **Response Interfaces**: `SupplyResponse`, `BorrowResponse`, `RepayResponse`, `WithdrawResponse`

### Liquidity Actions

- **Type**: `'liquidity-supply'`, `'liquidity-withdraw'`
- **Purpose**: Liquidity pool operations
- **Request Interface**: Various (see action implementations)
- **Response Interfaces**: Protocol-specific responses

Each action type works with `TokenSet` objects that organize tokens by blockchain chain, supporting multi-chain protocols.

## Action Definition Structure

Each action definition must include:

- **type**: The action category (must be one of the supported action types)
- **callback**: The function that executes when the action is triggered
- **inputTokens**: Function returning token sets organized by blockchain chain
- **outputTokens [Optional]**: Function returning possible output token sets. If not provided, all input token sets are assumed as possible outputs

### Key Concepts

- **TokenSet**: Groups tokens by blockchain chain, with an optional ID for indicating equivalent sets
- **Chain**: Represents a blockchain network (Arbitrum, Ethereum, Solana, etc.)
- **Multi-Chain Support**: Your plugin can support tokens across multiple blockchain networks

### Swap Action Example

```typescript
import type { SwapActionRequest, SwapResponse } from 'ember-plugin';
import type { ActionDefinition, Chain, TokenSet } from 'ember-plugin';
import { ChainType } from 'ember-plugin';

const arbitrumChain: Chain = {
  chainId: '42161',
  type: ChainType.EVM,
  name: 'Arbitrum One',
  iconUri: 'https://...',
  httpRpcUrl: 'https://...',
  blockExplorerUrls: ['https://arbiscan.io'],
};

const swapAction: ActionDefinition<'swap'> = {
  type: 'swap',
  callback: async (request: SwapActionRequest): Promise<SwapResponse> => {
    const { fromToken, toToken, amount, walletAddress } = request;

    // Implement your swap logic here
    const txHash = await myProtocol.swap({
      from: fromToken,
      to: toToken,
      amount,
      userAddress: walletAddress,
    });

    return {
      success: true,
      transactionHash: txHash,
      // ... other response fields
    };
  },
  inputTokens: async (): Promise<TokenSet[]> => {
    // Return token sets available for swapping on your protocol
    return [
      {
        id: 'arbitrum-swap-tokens',
        chain: arbitrumChain,
        tokens: new Set(await myProtocol.getSupportedTokens()),
      },
    ];
  },
  outputTokens: async (): Promise<TokenSet[]> => {
    // Return possible output token sets (often same as input for swaps)
    return [
      {
        id: 'arbitrum-swap-tokens', // Same ID indicates same token set
        chain: arbitrumChain,
        tokens: new Set(await myProtocol.getSupportedTokens()),
      },
    ];
  },
};
```

### Lending Action Example

```typescript
import type { LendingInteractionRequest, SupplyResponse } from 'ember-plugin';
import type { ActionDefinition, Chain, TokenSet } from 'ember-plugin';
import { ChainType } from 'ember-plugin';

const arbitrumChain: Chain = {
  chainId: '42161',
  type: ChainType.EVM,
  name: 'Arbitrum One',
  iconUri: 'https://...',
  httpRpcUrl: 'https://...',
  blockExplorerUrls: ['https://arbiscan.io'],
};

const supplyAction: ActionDefinition<'lending-supply'> = {
  type: 'lending-supply',
  callback: async (request: LendingInteractionRequest): Promise<SupplyResponse> => {
    const { token, amount, walletAddress } = request;

    // Implement your supply logic
    const txHash = await myLendingProtocol.supply({
      asset: token,
      amount,
      onBehalfOf: walletAddress,
    });

    return {
      success: true,
      transactionHash: txHash,
      // ... other response fields
    };
  },
  inputTokens: async (): Promise<TokenSet[]> => {
    // Return token sets that can be supplied to your lending protocol
    return [
      {
        id: 'arbitrum-lending-assets',
        chain: arbitrumChain,
        tokens: new Set(await myLendingProtocol.getSupplyableAssets()),
      },
    ];
  },
};
```

### Token Management

Make sure to be explicit about which tokens and chains your protocol supports:

```typescript
inputTokens: async (): Promise<TokenSet[]> => {
  return [
    {
      id: 'arbitrum-tokens',
      chain: {
        chainId: '42161',
        type: ChainType.EVM,
        name: 'Arbitrum One',
        iconUri: 'https://...',
        httpRpcUrl: 'https://...',
        blockExplorerUrls: ['https://arbiscan.io'],
      },
      tokens: new Set([
        { symbol: 'USDC', address: '0x...', decimals: 6 },
        { symbol: 'WETH', address: '0x...', decimals: 18 },
        // ... other supported tokens
      ]),
    },
    // Add more chains if your protocol is multi-chain
  ];
};
```

## Contributing

When contributing new action types or improvements:

1. Ensure backward compatibility
2. Add comprehensive TypeScript types
3. Include example implementations
4. Write tests for new functionality
5. Create documentation

Checkout our [contribution guidelines](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/CONTRIBUTIONS.md) to get started.
