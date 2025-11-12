## Development Workflow

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
