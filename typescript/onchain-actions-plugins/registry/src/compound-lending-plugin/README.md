# 🏦 Compound V3 Lending Plugin

> A comprehensive Ember plugin for integrating with Compound V3 (Comet) lending protocol. This plugin provides a complete interface for querying user positions, calculating risk metrics, and creating transactions for all Compound V3 lending operations.

## 📋 Overview

Compound V3 (Comet) is a simplified lending protocol that differs from Compound V2 in several key ways:

- 🎯 **Single Borrowable Asset**: Only one asset can be borrowed (the "base token", typically a stablecoin like USDC)
- 💎 **Multiple Collateral Assets**: Multiple assets can be supplied as collateral
- ⚡ **Simplified Mechanics**: Borrowing is done via `withdraw()` of the base token, repaying via `supply()` of the base token
- 🚀 **Efficient Design**: Uses bitmap-based asset tracking and optimized price calculations

## ✨ Supported Operations

### 🔍 Queries

- **📊 Get Positions**: Query user lending positions including:
  - 💰 Collateral positions with USD values
  - 📉 Borrow positions (base token only)
  - ⚠️ Health factor (liquidation risk metric)
  - 📈 Loan-to-Value (LTV) ratio as percentage (0-100)
  - 💵 Available borrow capacity
  - 💎 Net worth (collateral - borrows)
  - 🚨 Liquidation threshold

### 💸 Transactions (Implemented)

- **⬆️ Supply**: Deposit collateral or base token to earn yield
  - 🌐 Supports native ETH with automatic WETH wrapping
  - ⚙️ Requires `wrappedNativeToken` to be configured for native ETH support
- **⬇️ Withdraw**: Withdraw collateral or base token supply
- **📥 Borrow**: Borrow base token against collateral (implemented as withdraw of base token)
- **📤 Repay**: Repay borrowed base token (implemented as supply of base token)

## 🌐 Supported Chains & Markets

### 🔷 Ethereum Mainnet (Chain ID: 1)

- 💵 `USDC` - cUSDCv3 market
- 🔷 `WETH` - cWETHv3 market
- 💵 `USDT` - cUSDTv3 market
- 🔷 `WSTETH` - cWSTETHv3 market
- 💵 `USDS` - cUSDSv3 market

### ⚡ Arbitrum (Chain ID: 42161)

- 💵 `USDCE` - cUSDCEv3 market
- 💵 `USDC` - cUSDCv3 market
- 🔷 `WETH` - cWETHv3 market
- 💵 `USDT` - cUSDTv3 market

### 🔵 Base (Chain ID: 8453)

- 💵 `USDC` - cUSDCv3 market
- 💵 `USDBC` - cUSDBCv3 market
- 🔷 `WETH` - cWETHv3 market
- 🚀 `AERO` - cAEROv3 market

## 🏗️ Architecture

```
compound-lending-plugin/
├── index.ts            # 🔌 Plugin registration and action definitions
├── adapter.ts          # ⚙️ Core Compound V3 protocol integration
├── chain.ts           # 🌐 Chain configuration and RPC provider
├── market.ts          # 📊 Market data and address resolution
├── address-book.ts    # 📖 Contract addresses by chain and market
├── error.ts           # ⚠️ Error handling and Compound-specific error extraction
├── userSummary.ts     # 👤 User position data structures
└── README.md          # 📝 This file
```

## 🔧 Key Components

### 1️⃣ Plugin Interface & Registration (`index.ts`)

The main plugin export demonstrating the complete `EmberPlugin` interface:

```typescript
export async function getCompoundEmberPlugin(
  params: CompoundAdapterParams,
): Promise<EmberPlugin<'lending'>> {
  const adapter = new CompoundAdapter(params);

  return {
    id: `COMPOUND_V3_CHAIN_${params.chainId}_MARKET_${params.marketId}`,
    type: 'lending',
    name: `Compound V3 ${params.marketId} market on chain ${params.chainId}`,
    description: 'Compound V3 (Comet) lending protocol',
    website: 'https://compound.finance',
    x: 'https://x.com/compoundfinance',
    actions: await getCompoundActions(adapter),
    queries: {
      getPositions: adapter.getUserSummary.bind(adapter),
    },
  };
}
```

### 2️⃣ Protocol Adapter (`adapter.ts`)

The core `CompoundAdapter` class handles all Compound V3 protocol interactions:

```typescript
export class CompoundAdapter {
  public readonly chain: Chain;
  public readonly market: CompoundMarket;

  constructor(params: CompoundAdapterParams) {
    this.chain = new Chain(params.chainId, params.rpcUrl, params.wrappedNativeToken);
    this.market = getMarket(params.chainId, params.marketId);
  }

  // Query methods
  async getUserSummary(
    params: GetWalletLendingPositionsRequest,
  ): Promise<GetWalletLendingPositionsResponse>;

  // Transaction methods
  async createSupplyTransaction(params: SupplyTokensRequest): Promise<SupplyTokensResponse>;
  async createWithdrawTransaction(params: WithdrawTokensRequest): Promise<WithdrawTokensResponse>;
  async createBorrowTransaction(params: BorrowTokensRequest): Promise<BorrowTokensResponse>;
  async createRepayTransaction(params: RepayTokensRequest): Promise<RepayTokensResponse>;
}
```

### 3️⃣ Data Sources

The plugin interacts with the following on-chain data sources:

#### 📜 Smart Contracts

- **🏦 Comet Contract**: Main lending contract for each market
  - 📍 Addresses defined in `address-book.ts`
  - ⚡ Provides all lending operations and position queries
  - ⛽ Uses minimal ABI for gas efficiency
  - ⚠️ **Note**: Comet contract does NOT accept native ETH directly - requires WETH

- **🔷 WETH Contract**: Used for native ETH auto-wrapping
  - 🌐 When native ETH is supplied, adapter automatically creates WETH deposit transaction
  - ⚙️ WETH address must be provided via `wrappedNativeToken` in adapter params
  - ✅ This matches Compound's UI behavior where backend wraps ETH before supplying

#### 📊 Price Feeds

- **🔗 Chainlink Oracles**: Used via Compound V3's `getPrice()` function
  - 🎯 Prices use 8 decimal precision (1e8)
  - 📏 Aligns with Chainlink standard
  - 🔍 Accessed through Comet contract's price feed registry

#### ⚖️ Protocol Scales

- **📏 baseScale**: Scaling factor for base token (typically 1e6 for USDC)
- **📐 factorScale**: Scaling factor for collateral/liquidation factors (typically 1e18)
- **💰 priceScale**: Scaling factor for prices (1e8, aligns with Chainlink)

### 4️⃣ Risk Metrics Calculation

The adapter calculates several important risk metrics:

#### ⚠️ Health Factor

```
Health Factor = (Max Borrowable Value) / (Current Borrow Value)
Where Max Borrowable = Collateral Value × Liquidation Factor

✅ Health Factor > 1: Position is safe
⚠️ Health Factor = 1: At liquidation threshold
🚨 Health Factor < 1: Position can be liquidated
```

#### 📈 Loan-to-Value (LTV)

```
LTV = (Borrow Value / Collateral Value) × 100
Returns as percentage (0-100) for consistency with industry standards
```

#### 💵 Available Borrows

```
Available Borrows = Max Borrowable - Current Borrows
Max Borrowable = Collateral Value × Liquidation Factor
```

## 💻 Usage Examples

### 🚀 Basic Setup

```typescript
import { CompoundAdapter } from '@emberai/onchain-actions-registry/compound-lending-plugin';

// Initialize adapter for Arbitrum USDC market
const adapter = new CompoundAdapter({
  chainId: 42161,
  rpcUrl: 'https://arb1.arbitrum.io/rpc',
  marketId: 'USDC',
});
```

### 🔍 Query User Positions

```typescript
const positions = await adapter.getUserSummary({
  walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
});

console.log(`Health Factor: ${positions.healthFactor}`);
console.log(`LTV: ${positions.currentLoanToValue}%`);
console.log(`Total Collateral: $${positions.totalCollateralUsd}`);
console.log(`Total Borrows: $${positions.totalBorrowsUsd}`);
console.log(`Available Borrows: $${positions.availableBorrowsUsd}`);
```

### ⬆️ Create Supply Transaction

```typescript
// Supply ERC20 token (e.g., WETH, USDC, WBTC)
const supplyResult = await adapter.createSupplyTransaction({
  supplyToken: {
    tokenUid: {
      address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', // WETH
      chainId: '42161',
    },
    decimals: 18,
    name: 'Wrapped Ether',
    symbol: 'WETH',
  },
  amount: BigInt('1000000000000000000'), // 1 WETH
  walletAddress: '0x...',
});

// 🌐 Supply native ETH (auto-wraps to WETH)
// ⚙️ Note: Requires wrappedNativeToken to be configured in adapter params
// 📝 Native ETH is represented as 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE (standard DeFi convention)
const ethSupplyResult = await adapter.createSupplyTransaction({
  supplyToken: {
    tokenUid: {
      address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', // Native ETH placeholder
      chainId: '42161',
    },
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  amount: BigInt('1000000000000000000'), // 1 ETH
  walletAddress: '0x...',
});
// Result includes: [WETH.deposit(), WETH.approve(), Comet.supply()]
// The adapter automatically wraps ETH to WETH before supplying

// Execute transactions
for (const tx of supplyResult.transactions) {
  // Send transaction using your wallet provider
  // For native ETH, first transaction will have value set to the ETH amount
  await wallet.sendTransaction(tx);
}
```

### 📥 Create Borrow Transaction

```typescript
const borrowResult = await adapter.createBorrowTransaction({
  borrowToken: {
    tokenUid: {
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC (base token)
      chainId: '42161',
    },
    decimals: 6,
    name: 'USD Coin',
    symbol: 'USDC',
  },
  amount: BigInt('1000000'), // 1 USDC
  walletAddress: '0x...',
});

console.log(`Borrow APY: ${borrowResult.currentBorrowApy}`);
console.log(`Liquidation Threshold: ${borrowResult.liquidationThreshold}`);

// Execute transactions
for (const tx of borrowResult.transactions) {
  await wallet.sendTransaction(tx);
}
```

## 🧪 Testing

### 🏃 Running Tests

The plugin includes comprehensive test coverage with both unit and integration tests.

#### ✅ Run All Tests

```bash
cd typescript/onchain-actions-plugins/registry
pnpm test
```

#### 🧩 Run Unit Tests Only

```bash
pnpm test:unit
```

#### 🔗 Run Integration Tests Only

```bash
pnpm test:int
```

#### 🐛 Run Integration Tests with Debug Logging

```bash
pnpm test:int:debug
```

### 📁 Test Structure

```
tests/compound-lending-plugin/
├── integration/
│   ├── adapter.transaction.int.test.ts    # Transaction method tests
│   └── compound-lending-plugin/
│       └── adapter.int.test.ts            # Position query tests
└── unit/
    └── compound-lending-plugin/
        ├── error.unit.test.ts             # Error handling tests
        ├── market.unit.test.ts            # Market resolution tests
        └── userSummary.unit.test.ts       # User summary tests
```

### ⚙️ Integration Test Requirements

Integration tests require:

1. 🌐 **RPC URL**: Set `ARBITRUM_ONE_RPC_URL` in `.env.test` or use default public RPC
2. 💼 **Test Wallet**: For transaction tests, Anvil fork is recommended
3. 🔢 **Block Number** (optional): Set `TEST_BLOCK_NUMBER` for deterministic testing

Example `.env.test`:

```env
ARBITRUM_ONE_RPC_URL=https://arb1.arbitrum.io/rpc
TEST_BLOCK_NUMBER=12345678
```

### 🎯 Running Specific Tests

```bash
# Run a specific test file
pnpm test:int tests/compound-lending-plugin/integration/adapter.transaction.int.test.ts

# Run tests matching a pattern
pnpm test:int tests/*transaction*.int.test.ts

# Run specific test by name
pnpm test:int -t "should calculate LTV correctly"
```

## 🔧 Implementation Details

### 💾 Contract Instance Caching

The adapter caches contract instances and base token addresses to improve performance:

```typescript
// Contract instance is cached after first creation
private _cometContract: CometContract | null = null;

// Base token address is cached after first fetch
private _baseToken: string | null = null;
```

### ⚡ Asset Tracking Optimization

The adapter uses Compound V3's `assetsIn` bitmap to efficiently track user assets:

```typescript
// Only query balances for assets the user actually has
const assetsIn = userBasic.assetsIn; // Bitmap: Bit 0 = asset 0, Bit 1 = asset 1, etc.
const assetBit = 1 << i;
if ((assetsInNum & assetBit) === 0) {
  continue; // Skip assets not in user's portfolio
}
```

### ⚠️ Error Handling

The plugin includes specialized error handling for Compound V3:

- 🎯 **CompoundError**: Wraps Compound-specific contract errors
- 🔍 **Error Name Extraction**: Extracts error names from contract reverts
- ✅ **Whitelist Validation**: Only recognized Compound V3 errors are wrapped

### 🎯 Precision & Scaling

All calculations use BigNumber for precision:

- 💰 **Price Calculations**: 8 decimal precision (priceScale)
- ⚠️ **Health Factor**: 18 decimal precision
- 📈 **LTV**: Percentage format (0-100) with 18 decimal precision
- 💵 **USD Values**: 8 decimal precision

## 🔌 Registry Integration

The plugin automatically registers for all supported chains:

```typescript
// In onchain-actions-plugins/registry/src/index.ts
import { registerCompound } from './compound-lending-plugin/index.js';

export function initializePublicRegistry(chainConfigs: ChainConfig[]) {
  const registry = new PublicEmberPluginRegistry();

  for (const chainConfig of chainConfigs) {
    // Compound plugin automatically registers for supported chains
    registerCompound(chainConfig, registry);
  }

  return registry;
}
```

The plugin uses deferred registration and creates a separate plugin instance for each market:

```typescript
// One plugin per market (e.g., USDC, WETH, etc.)
registry.registerDeferredPlugin(
  getCompoundEmberPlugin({
    chainId: chainConfig.chainId,
    rpcUrl: chainConfig.rpcUrl,
    marketId: 'USDC', // or 'WETH', 'USDT', etc.
    wrappedNativeToken: chainConfig.wrappedNativeToken,
  }),
);
```

## 📚 API Reference

### 🏦 CompoundAdapter

#### 🏗️ Constructor

```typescript
constructor(params: CompoundAdapterParams)
```

**Parameters:**

- 🌐 `chainId: number` - Chain ID (1, 42161, 8453)
- 🔗 `rpcUrl: string` - RPC endpoint URL
- 📊 `marketId: string` - Market identifier ('USDC', 'WETH', etc.)
- 🔷 `wrappedNativeToken?: string` - Optional wrapped native token address

#### 🔧 Methods

##### 🔍 getUserSummary

```typescript
async getUserSummary(
  params: GetWalletLendingPositionsRequest
): Promise<GetWalletLendingPositionsResponse>
```

Retrieves comprehensive lending position information for a wallet.

**Parameters:**

- 👤 `walletAddress: string` - Ethereum address to query (case-insensitive)

**Returns:**

- 💰 `userReserves: Array` - User's reserve positions
- 💵 `totalCollateralUsd: string` - Total collateral value in USD
- 📉 `totalBorrowsUsd: string` - Total borrows value in USD
- 💎 `netWorthUsd: string` - Net worth (collateral - borrows)
- 💵 `availableBorrowsUsd: string` - Available borrow capacity
- 📈 `currentLoanToValue: string` - LTV as percentage (0-100)
- 🚨 `currentLiquidationThreshold: string` - Liquidation threshold
- ⚠️ `healthFactor: string` - Health factor (1+ = safe, <1 = at risk)

##### ⬆️ createSupplyTransaction

```typescript
async createSupplyTransaction(
  params: SupplyTokensRequest
): Promise<SupplyTokensResponse>
```

Creates transaction plan for supplying collateral or base token.

**Parameters:**

- 💰 `supplyToken: Token` - Token to supply
- 🔢 `amount: bigint` - Amount in token's native decimals
- 👤 `walletAddress: string` - Address supplying tokens

**Returns:**

- 📝 `transactions: TransactionPlan[]` - Array of transactions (approval + supply)

##### ⬇️ createWithdrawTransaction

```typescript
async createWithdrawTransaction(
  params: WithdrawTokensRequest
): Promise<WithdrawTokensResponse>
```

Creates transaction plan for withdrawing collateral or base token.

**Parameters:**

- 💰 `tokenToWithdraw: Token` - Token to withdraw
- 🔢 `amount: bigint` - Amount in token's native decimals

**Returns:**

- 📝 `transactions: TransactionPlan[]` - Array with withdraw transaction

##### 📥 createBorrowTransaction

```typescript
async createBorrowTransaction(
  params: BorrowTokensRequest
): Promise<BorrowTokensResponse>
```

Creates transaction plan for borrowing base token.

**Parameters:**

- 💰 `borrowToken: Token` - Must be the base token
- 🔢 `amount: bigint` - Amount to borrow
- 👤 `walletAddress: string` - Address borrowing

**Returns:**

- 📝 `transactions: TransactionPlan[]` - Array with borrow transaction
- 🚨 `liquidationThreshold: string` - Current liquidation threshold
- 📊 `currentBorrowApy: string` - Current borrow APY

**Throws:** ⚠️ Error if borrowToken is not the base token

##### 📤 createRepayTransaction

```typescript
async createRepayTransaction(
  params: RepayTokensRequest
): Promise<RepayTokensResponse>
```

Creates transaction plan for repaying borrowed base token.

**Parameters:**

- 💰 `repayToken: Token` - Must be the base token
- 🔢 `amount: bigint` - Amount to repay
- 👤 `walletAddress: string` - Address repaying

**Returns:**

- 📝 `transactions: TransactionPlan[]` - Array of transactions (approval + repay)

**Throws:** ⚠️ Error if repayToken is not the base token

## 📚 Resources

- 📖 [Compound V3 Documentation](https://docs.compound.finance/helper-functions/)
- 🔧 [Compound V3 ABI Reference](https://docs.compound.finance/public/files/comet-interface-abi-98f438b.json)
- 🌐 [Compound Finance Website](https://compound.finance)
- 🐦 [Compound on X/Twitter](https://x.com/compoundfinance)

## 🤝 Contributing

When contributing to this plugin:

1. 📐 Follow the existing code structure and patterns
2. ✅ Add comprehensive tests for new features
3. 📝 Update this README with any new functionality
4. 🧪 Ensure all tests pass: `pnpm test`
5. 🔍 Run linting: `pnpm lint`
