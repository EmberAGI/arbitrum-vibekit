# Radiant Lending Onchain-Actions Plugin

TypeScript plugin for integration with Radiant V2 Lending Protocol on Arbitrum. Provides API for reading market data, user positions, and building lending transactions.

## Features

- ✅ Fetch market data (APR, liquidity, prices)
- ✅ Get user positions (collateral, debt, health factor)
- ✅ Build supply/withdraw/borrow/repay transactions
- ✅ Enable/disable collateral for borrowing
- ✅ Full TypeScript support
- ✅ Uses viem for RPC calls
- ✅ No external API dependencies
- ✅ Unit tested with Vitest

## Installation

```bash
npm install
```

## Quick Start

```typescript
import { radiantPlugin } from './src/index.js';

// Fetch all markets
const markets = await radiantPlugin.actions.fetchMarkets();
console.log(markets);

// Get user position
const position = await radiantPlugin.actions.getUserPosition('0xUserAddress...');
console.log(position);

// Build supply transaction
const supplyTx = radiantPlugin.actions.supply({
  token: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // USDC
  amount: '1000000',
  onBehalfOf: '0xYourAddress...'
});

// Build withdraw transaction
const withdrawTx = radiantPlugin.actions.withdraw({
  token: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  amount: '1000000',
  to: '0xYourAddress...'
});

// Build borrow transaction
const borrowTx = radiantPlugin.actions.borrow({
  token: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  amount: '1000000',
  rateMode: 2, // 1 = stable, 2 = variable
  onBehalfOf: '0xYourAddress...'
});

// Build repay transaction
const repayTx = radiantPlugin.actions.repay({
  token: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  amount: '1000000',
  rateMode: 2,
  onBehalfOf: '0xYourAddress...'
});

// Build setCollateral transaction (enable asset as collateral)
const setCollateralTx = radiantPlugin.actions.setCollateral({
  token: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  useAsCollateral: true
});
```

## API Reference

### `fetchMarkets()`

Fetches market data for all supported assets.

**Returns:**
```typescript
type MarketInfo = {
  symbol: string;           // e.g., "USDC"
  address: string;          // Token address
  decimals: number;         // Token decimals
  ltv: number;              // Loan-to-value ratio
  liquidationThreshold: number;
  supplyAPR: string;        // Annual supply rate
  borrowAPR: string;        // Annual borrow rate
  liquidity: string;        // Available liquidity
  price: string;            // Asset price in USD
};
```

**Example:**
```typescript
const markets = await radiantPlugin.actions.fetchMarkets();
// [
//   {
//     symbol: "USDC",
//     address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
//     decimals: 6,
//     ltv: 80,
//     liquidationThreshold: 85,
//     supplyAPR: "3.45",
//     borrowAPR: "5.67",
//     liquidity: "1000000000000",
//     price: "1000000000000000000"
//   },
//   ...
// ]
```

### `getUserPosition(address: string)`

Fetches user's lending position on Radiant.

**Parameters:**
- `address` - User wallet address

**Returns:**
```typescript
type UserPosition = {
  address: string;
  healthFactor: string;      // Health factor (< 1 = liquidatable)
  totalCollateralUSD: string;
  totalDebtUSD: string;
  positions: {
    asset: string;           // Asset symbol
    supplied: string;        // Supplied amount
    borrowed: string;        // Borrowed amount
  }[];
};
```

**Example:**
```typescript
const position = await radiantPlugin.actions.getUserPosition('0x123...');
// {
//   address: "0x123...",
//   healthFactor: "1500000000000000000", // 1.5
//   totalCollateralUSD: "10000000000",
//   totalDebtUSD: "5000000000",
//   positions: [
//     { asset: "USDC", supplied: "10000000000", borrowed: "0" },
//     { asset: "WETH", supplied: "0", borrowed: "2000000000000000000" }
//   ]
// }
```

### `supply(params)`

Builds a transaction to supply assets to Radiant.

**Parameters:**
```typescript
{
  token: string;        // Token address
  amount: string;       // Amount in wei/smallest unit
  onBehalfOf?: string;  // Optional: supply on behalf of another address
}
```

**Returns:**
```typescript
type TxBuildResult = {
  to: string;      // LendingPool address
  data: string;    // Encoded transaction data
  value: string;   // ETH value (usually "0")
};
```

### `withdraw(params)`

Builds a transaction to withdraw assets from Radiant.

**Parameters:**
```typescript
{
  token: string;   // Token address
  amount: string;  // Amount in wei/smallest unit
  to?: string;     // Optional: recipient address
}
```

### `borrow(params)`

Builds a transaction to borrow assets from Radiant.

**Parameters:**
```typescript
{
  token: string;        // Token address
  amount: string;       // Amount in wei/smallest unit
  rateMode?: number;    // 1 = stable, 2 = variable (default: 2)
  onBehalfOf?: string;  // Optional: borrow on behalf of another address
}
```

### `repay(params)`

Builds a transaction to repay borrowed assets.

**Parameters:**
```typescript
{
  token: string;        // Token address
  amount: string;       // Amount in wei/smallest unit
  rateMode?: number;    // 1 = stable, 2 = variable (default: 2)
  onBehalfOf?: string;  // Optional: repay on behalf of another address
}
```

### `setCollateral(params)`

Builds a transaction to enable or disable an asset as collateral.

**Important:** Before you can borrow, you must:
1. Supply assets using `supply()`
2. Enable them as collateral using `setCollateral({ useAsCollateral: true })`
3. Then you can `borrow()` against your collateral

You cannot disable collateral if it would cause your health factor to drop below 1.0.

**Parameters:**
```typescript
{
  token: string;           // Token address
  useAsCollateral: boolean; // true = enable, false = disable
}
```

**Example:**
```typescript
// Step 1: Supply USDC
const supplyTx = radiantPlugin.actions.supply({
  token: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  amount: '10000000000', // 10,000 USDC
  onBehalfOf: '0xYourAddress...'
});

// Step 2: Enable USDC as collateral
const enableCollateralTx = radiantPlugin.actions.setCollateral({
  token: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  useAsCollateral: true
});

// Step 3: Now you can borrow against it
const borrowTx = radiantPlugin.actions.borrow({
  token: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', // WETH
  amount: '1000000000000000000', // 1 WETH
  rateMode: 2,
  onBehalfOf: '0xYourAddress...'
});
```

## Supported Assets

| Symbol | Address |
|--------|---------|
| WETH | `0x82aF49447D8a07e3bd95BD0d56f35241523fBab1` |
| USDC | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` |
| USDT | `0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9` |
| WBTC | `0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f` |
| ARB  | `0x912CE59144191C1204E64559FE8253a0e49E6548` |

## Contract Addresses (Arbitrum)

- **LendingPool**: `0xE23B4AE3624fB6f7cDEF29bC8EAD912f1Ede6886`
- **DataProvider**: `0x596B0cc4c5094507C50b579a662FE7e7b094A2cC`
- **Oracle**: `0xC0cE5De939aaD880b0bdDcf9aB5750a53EDa454b`
- **RDNT Token**: `0x3082CC23568eA640225c2467653dB90e9250AaA0`

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch
```

**Test Coverage:**
- ✅ Market data fetching
- ✅ User position queries
- ✅ Transaction building and encoding

## Project Structure

```
radiant/
├── src/
│   ├── index.ts          # Main entry point & exports
│   ├── markets.ts        # Market data queries
│   ├── positions.ts      # User position queries
│   └── actions.ts        # Transaction builders
├── test/
│   ├── markets.test.ts   # Market tests
│   ├── positions.test.ts # Position tests
│   └── actions.test.ts   # Action tests
├── radiant.config.ts     # Contract addresses & config
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

## Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run tests
npm test
```

## TypeScript Types

```typescript
import type { 
  MarketInfo, 
  UserPosition, 
  TxBuildResult 
} from './src/index.js';
```

## Notes

- All amounts must be in wei/smallest unit format (e.g., USDC with 6 decimals: 1 USDC = "1000000")
- Transaction builders only create calldata, they don't send transactions
- Health factor < 1.0 means the position can be liquidated
- Rate mode: 1 = stable rate, 2 = variable rate

## License

MIT

## Links

- [Radiant Capital](https://radiant.capital/)
- [Radiant Docs](https://docs.radiant.capital/)
- [Arbitrum](https://arbitrum.io/)
