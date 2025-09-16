# @emberai/onchain-actions-registry

[![npm version](https://img.shields.io/npm/v/@emberai/onchain-actions-registry.svg)](https://www.npmjs.com/package/@emberai/onchain-actions-registry)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/LICENSE)

A modular plugin architecture for integrating DeFi protocols into the Ember ecosystem. Build custom protocol plugins with TypeScript support and comprehensive type safety.

## Features

- **Modular Plugin System**: Extensible architecture for DeFi protocol integrations.
- **Multi-Protocol Support**: Lending, liquidity, swap, perpetuals protocol.
- **Type Safety**: Full TypeScript support with Zod validation schemas
- **Multi-Chain**: Support for multiple blockchain networks.
- **Action-Based**: Define actions for supply, borrow, swap, and more.
- **Plugin for AAVE V3**: Complete lending protocol with supply, borrow, repay, withdraw.

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

## Quickstart

```typescript
import { initializePublicRegistry, type ChainConfig } from '@emberai/onchain-actions-registry';

// 1. Define your chain configuration
const chainConfigs: ChainConfig[] = [
  {
    chainId: 42161,
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
    wrappedNativeToken: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
  },
];

// 2. Initialize the registry with your chains
const registry = initializePublicRegistry(chainConfigs);

// 3. Iterate through available plugins
for await (const plugin of registry.getPlugins()) {
  console.log(`Loaded plugin: ${plugin.name} (${plugin.type})`);
}
```

## Plugin Types

The registry supports four main plugin types:

### Lending Plugins

Supply, borrow, repay, and withdraw operations across lending protocols.

```typescript
import type { EmberPlugin } from '@emberai/onchain-actions-registry';

const lendingPlugin: EmberPlugin<'lending'> = {
  type: 'lending',
  name: 'AAVE V3',
  actions: [
    // lending-supply, lending-borrow, lending-repay, lending-withdraw
  ],
  queries: {
    getPositions: async params => {
      /* Get user positions */
    },
  },
};
```

### Liquidity Plugins

Add and remove liquidity from DEX pools and AMMs.

```typescript
const liquidityPlugin: EmberPlugin<'liquidity'> = {
  type: 'liquidity',
  name: 'Camelot DEX',
  actions: [
    // liquidity-supply, liquidity-withdraw
  ],
  queries: {
    getWalletPositions: async params => {
      /* Get LP positions */
    },
    getPools: async () => {
      /* Get available pools */
    },
  },
};
```

### Swap Plugins

Token exchange operations with slippage protection.

```typescript
const swapPlugin: EmberPlugin<'swap'> = {
  type: 'swap',
  name: 'DEX Aggregator',
  actions: [
    // swap
  ],
  queries: {}, // Stateless operations
};
```

### Perpetuals Plugins

Long, short, and close perpetual positions with leverage.

```typescript
const perpetualsPlugin: EmberPlugin<'perpetuals'> = {
  type: 'perpetuals',
  name: 'GMX V2',
  actions: [
    // perpetuals-long, perpetuals-short, perpetuals-close
  ],
  queries: {
    getMarkets: async params => {
      /* Get available markets */
    },
    getPositions: async params => {
      /* Get open positions */
    },
    getOrders: async params => {
      /* Get pending orders */
    },
  },
};
```

## Building Custom Plugins

For a comprehensive guide on building custom plugins, checkout the [GitHub repository](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/onchain-actions-plugins/).

### 1. Define Your Plugin

```typescript
import type {
  ActionDefinition,
  EmberPlugin,
  LendingActions,
} from '@emberai/onchain-actions-registry';

export async function getMyProtocolPlugin(params: {
  chainId: number;
  rpcUrl: string;
}): Promise<EmberPlugin<'lending'>> {
  return {
    type: 'lending',
    name: 'My Protocol',
    description: 'Custom lending protocol integration',
    website: 'https://myprotocol.com',
    actions: await getMyProtocolActions(params),
    queries: {
      getPositions: async params => {
        // Implement position querying logic
        return { positions: [] };
      },
    },
  };
}
```

### 2. Implement Actions

```typescript
async function getMyProtocolActions(params: any): Promise<ActionDefinition<LendingActions>[]> {
  return [
    {
      type: 'lending-supply',
      name: 'Supply to My Protocol',
      inputTokens: async () => [
        {
          chainId: params.chainId.toString(),
          tokens: ['0x...'], // Supported input tokens
        },
      ],
      outputTokens: async () => [
        {
          chainId: params.chainId.toString(),
          tokens: ['0x...'], // Yield tokens received
        },
      ],
      callback: async request => {
        // Implement supply transaction logic
        return { transactions: [] };
      },
    },
  ];
}
```

### 3. Register Your Plugin

```typescript
import { PublicEmberPluginRegistry } from '@emberai/onchain-actions-registry';

const registry = new PublicEmberPluginRegistry();

// For async plugins (recommended)
registry.registerDeferredPlugin(
  getMyProtocolPlugin({
    chainId: 42161,
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
  })
);

// For synchronous plugins
registry.registerPlugin(myInstantPlugin);
```

## PLugin Interfaces

### Core Types

```typescript
interface EmberPlugin<Type extends PluginType> {
  id?: string;
  type: Type;
  name: string;
  description?: string;
  website?: string;
  x?: string;
  actions: ActionDefinition<AvailableActions[Type]>[];
  queries: AvailableQueries[Type];
}

interface ActionDefinition<T extends Action> {
  name: string;
  type: T;
  callback: ActionCallback<T>;
  inputTokens: () => Promise<TokenSet[]>;
  outputTokens?: () => Promise<TokenSet[]>;
}

interface TokenSet {
  chainId: string;
  tokens: string[];
}
```

### Registry Methods

```typescript
class PublicEmberPluginRegistry {
  registerPlugin(plugin: EmberPlugin<PluginType>): void;
  registerDeferredPlugin(pluginPromise: Promise<EmberPlugin<PluginType>>): void;
  getPlugins(): AsyncIterable<EmberPlugin<PluginType>>;
}
```

## Contributing

We welcome contributions! Please see our [Contributing Guide](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/CONTRIBUTIONS.md) for details.

## License

MIT © [EmberAGI](https://github.com/EmberAGI/arbitrum-vibekit/blob/main/LICENSE)

## Links

- [NPM Package](https://www.npmjs.com/package/@emberai/onchain-actions-registry)
- [GitHub Repository](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/onchain-actions-plugins/)
- [Ember Website](https://www.emberai.xyz/)
- [Ember X](https://x.com/EmberAGI)
