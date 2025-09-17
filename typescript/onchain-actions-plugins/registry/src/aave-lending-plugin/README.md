# AAVE Lending Plugin

This guide is a comprehensive reference implementation of an Ember plugin for AAVE V3 lending protocol integration. This plugin serves as both a functional AAVE integration and a complete example for developers building their own protocol plugins.

## Supported Operations

- **Supply**: Deposit tokens to earn yield (receive aTokens)
- **Borrow**: Borrow assets against supplied collateral
- **Repay**: Pay back borrowed amounts (supports both underlying tokens and aTokens)
- **Withdraw**: Redeem aTokens for underlying assets
- **Positions**: Query user lending positions and health factors

## Architecture

```
onchain-actions-plugins/registry/src/aave-lending-plugin/
├── index.ts            # Main plugin export, action definitions, and registry integration
├── adapter.ts          # Core AAVE protocol integration
├── chain.ts           # Chain configuration and contract addresses
├── market.ts          # AAVE market data retrieval
├── dataProvider.ts    # UI data provider integration
├── userSummary.ts     # User position queries
├── populateTransaction.ts  # Transaction building utilities
├── errors.ts          # Error handling and validation
└── README.md          # This file
```

## Key Components

### 1. Plugin Interface & Registration (`index.ts`)

The main plugin export demonstrating the complete `EmberPlugin` interface and registry integration:

```typescript
export async function getAaveEmberPlugin(
  params: AAVEAdapterParams
): Promise<EmberPlugin<'lending'>> {
  const adapter = new AAVEAdapter(params);

  return {
    id: `AAVE_CHAIN_${params.chainId}`,
    type: 'lending',
    name: `AAVE lending for ${params.chainId}`,
    description: 'Aave V3 lending protocol',
    website: 'https://aave.com',
    x: 'https://x.com/aave',
    actions: await getAaveActions(adapter), // 5 lending actions
    queries: {
      getPositions: adapter.getUserSummary.bind(adapter),
    },
  };
}

/**
 * Register the AAVE plugin for the specified chain configuration.
 */
export function registerAave(chainConfig: ChainConfig, registry: PublicEmberPluginRegistry) {
  const supportedChains = [42161]; // Currently only Arbitrum One
  if (!supportedChains.includes(chainConfig.chainId)) {
    return;
  }

  registry.registerDeferredPlugin(
    getAaveEmberPlugin({
      chainId: chainConfig.chainId,
      rpcUrl: chainConfig.rpcUrl,
      wrappedNativeToken: chainConfig.wrappedNativeToken,
    })
  );
}
```

### 2. Protocol Adapter (`adapter.ts`)

The core class handling all AAVE protocol interactions:

```typescript
export class AAVEAdapter {
  public chain: Chain;
  public market: AAVEMarket;

  // Protocol setup (adapter.ts:60-63)
  constructor(params: AAVEAdapterParams) {
    // Note: wrappedNativeToken is stored in params but not passed to Chain constructor
    this.chain = new Chain(params.chainId, params.rpcUrl);
    this.market = getMarket(this.chain.id);
  }

  // Public action implementations
  async createSupplyTransaction(params: SupplyTokensRequest): Promise<SupplyTokensResponse>;
  async createBorrowTransaction(params: BorrowTokensRequest): Promise<BorrowTokensResponse>;
  async createRepayTransaction(params: RepayTokensRequest): Promise<RepayTokensResponse>;
  async createRepayTransactionWithATokens(params: RepayTokensRequest): Promise<RepayTokensResponse>;
  async createWithdrawTransaction(params: WithdrawTokensRequest): Promise<WithdrawTokensResponse>;

  // Public query implementations
  async getUserSummary(
    params: GetWalletLendingPositionsRequest
  ): Promise<GetWalletLendingPositionsResponse>;
  async getReserves(): Promise<ReservesDataHumanized>;

  // Public utility methods
  public normalizeTokenAddress(token: Token): string; // Converts native tokens to AAVE placeholder address
}
```

### 3. Action Definitions

The plugin implements 5 distinct lending actions:

#### Supply Action

```typescript
{
  type: 'lending-supply',
  name: `AAVE lending pools in chain ${adapter.chain.id}`,
  inputTokens: async () => [
    {
      chainId: adapter.chain.id.toString(),
      tokens: underlyingAssets,    // User needs: USDC, WETH, DAI, etc.
    }
  ],
  outputTokens: async () => [
    {
      chainId: adapter.chain.id.toString(),
      tokens: aTokens,            // User receives: aUSDC, aWETH, aDAI, etc.
    }
  ],
  callback: adapter.createSupplyTransaction.bind(adapter),
}
```

#### Borrow Action

```typescript
{
  type: 'lending-borrow',
  name: `AAVE borrow in chain ${adapter.chain.id}`,
  inputTokens: async () => [
    {
      chainId: adapter.chain.id.toString(),
      tokens: aTokens,             // Collateral: aTokens
    }
  ],
  outputTokens: async () => [
    {
      chainId: adapter.chain.id.toString(),
      tokens: borrowableAssets,   // Borrowed: underlying tokens
    }
  ],
  callback: adapter.createBorrowTransaction.bind(adapter),
}
```

#### Repay Actions (Two Strategies)

```typescript
// Strategy 1: Repay with underlying tokens
{
  type: 'lending-repay',
  name: `AAVE repay in chain ${adapter.chain.id}`,
  inputTokens: async () =>
    Promise.resolve([
      {
        chainId: adapter.chain.id.toString(),
        tokens: borrowableAssets,    // USDC, WETH to repay
      },
    ]),
  // Empty output tokens as this doesn't generate any token
  outputTokens: async () => Promise.resolve([]),
  callback: adapter.createRepayTransaction.bind(adapter),
}

// Strategy 2: Repay directly with aTokens
{
  type: 'lending-repay',
  name: `AAVE repay with aTokens in chain ${adapter.chain.id}`,
  inputTokens: async () =>
    Promise.resolve([
      {
        chainId: adapter.chain.id.toString(),
        tokens: aTokens,             // aUSDC, aWETH to repay
      },
    ]),
  // Empty output tokens as this doesn't generate any token
  outputTokens: async () => Promise.resolve([]),
  callback: adapter.createRepayTransactionWithATokens.bind(adapter),
}
```

#### Withdraw Action

```typescript
{
  type: 'lending-withdraw',
  name: `AAVE withdraw in chain ${adapter.chain.id}`,
  inputTokens: async () =>
    Promise.resolve([
      {
        chainId: adapter.chain.id.toString(),
        tokens: aTokens,             // aTokens to redeem
      },
    ]),
  outputTokens: async () =>
    Promise.resolve([
      {
        chainId: adapter.chain.id.toString(),
        tokens: underlyingAssets,   // Underlying tokens received
      },
    ]),
  callback: adapter.createWithdrawTransaction.bind(adapter),
}
```

### 4. Registry Integration

The plugin uses the registry pattern with chain configuration support:

```typescript
// In onchain-actions-plugins/registry/src/index.ts
import { registerAave } from './aave-lending-plugin/index.js';

export function initializePublicRegistry(chainConfigs: ChainConfig[]) {
  const registry = new PublicEmberPluginRegistry();

  // Register plugins for each chain config
  for (const chainConfig of chainConfigs) {
    // AAVE plugin automatically registers for supported chains
    registerAave(chainConfig, registry);
  }

  return registry;
}
```

The plugin uses deferred registration for heavy initialization:

```typescript
// Plugin registration is deferred until needed
registry.registerDeferredPlugin(
  getAaveEmberPlugin({
    chainId: chainConfig.chainId,
    rpcUrl: chainConfig.rpcUrl,
    wrappedNativeToken: chainConfig.wrappedNativeToken,
  })
);
```
