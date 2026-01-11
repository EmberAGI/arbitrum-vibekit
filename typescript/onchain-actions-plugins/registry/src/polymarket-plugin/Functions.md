# Polymarket Adapter Functions Documentation

This document explains all functions implemented in the Polymarket adapter for prediction market trading.

## 🎯 Core Actions

### `placeOrder(request)`

**Purpose**: Place a buy or sell order for any outcome in a prediction market

- **Input**:
  - `chainId` - Chain ID (137 for Polygon)
  - `walletAddress` - Your wallet address
  - `marketId` - Market identifier
  - `outcomeId` - 'yes', 'no', or direct token ID
  - `side` - 'buy' or 'sell'
  - `size` - Number of shares
  - `price` - Limit price (0-1 range, optional)
- **Output**: Transaction plan with order ID
- **Usage**: Bet on any outcome in a prediction market

### `cancelOrder(request)`

**Purpose**: Cancel pending orders

- **Input**:
  - `chainId` - Chain ID
  - `walletAddress` - Your wallet address
  - `orderId` - Order ID or 'all' to cancel all
- **Output**: Success status and cancellation count
- **Usage**: Remove open orders from order book

### `redeem(request)`

**Purpose**: Redeem winnings from resolved markets

- **Input**:
  - `chainId` - Chain ID
  - `walletAddress` - Your wallet address
  - `marketId` - Market identifier
  - `outcomeId` - Specific outcome (optional)
  - `amount` - Amount to redeem (optional)
- **Output**: Transaction plan for on-chain redemption
- **Usage**: Claim your winnings after market resolution

---

## 📊 Queries

### `getMarkets(request)`

**Purpose**: Get available prediction markets

- **Input**:
  - `chainIds` - Array of chain IDs
  - `status` - 'active', 'resolved', 'voided', 'paused' (optional)
  - `searchQuery` - Search market titles (optional)
  - `limit`, `offset` - Pagination (optional)
- **Output**: List of markets with outcomes, prices, status
- **Usage**: Discover tradeable prediction markets

### `getPositions(request)`

**Purpose**: Get current outcome token holdings

- **Input**:
  - `walletAddress` - Your wallet address
  - `marketIds` - Filter by specific markets (optional)
  - `includeResolved` - Include settled positions (optional)
- **Output**: Current positions with market/outcome context
- **Usage**: Check what prediction market tokens you own

### `getOrders(request)`

**Purpose**: Get pending/open orders

- **Input**:
  - `walletAddress` - Your wallet address
  - `marketIds` - Filter by specific markets (optional)
  - `status` - Filter by order status (optional)
- **Output**: List of active orders with details
- **Usage**: Monitor your open trading orders

---

## 🔍 Advanced Analysis Functions

### `getTradingHistory(walletAddress, options?)`

**Purpose**: Get complete trading history (raw data)

- **Input**: Wallet address, optional filters (market, date range)
- **Output**: List of all past trades with raw condition IDs
- **Usage**: Basic trading history access

### `getTradingHistoryWithDetails(walletAddress, options?)`

**Purpose**: Get trading history with market titles and descriptions

- **Input**: Wallet address, optional filters (market, date range)
- **Output**: Enriched trades with market titles, slugs, and readable information
- **Usage**: Display trading history with human-readable market names

### `getUserEarnings(date?)`

**Purpose**: Get daily earnings and rewards

- **Input**: Optional date (defaults to today)
- **Output**: Earnings data for specified date
- **Usage**: Track your daily profits/losses

### `getPriceHistory(options)`

**Purpose**: Get historical price data for markets

- **Input**: Market ID, time range, interval
- **Output**: Price points over time
- **Usage**: Analyze market price trends

### `getMarketTrades(conditionID)`

**Purpose**: Get all trades for a specific market

- **Input**: Market/condition ID
- **Output**: List of all trades in that market
- **Usage**: See market activity and volume

### `getTokenBalances(walletAddress, tokenIds)`

**Purpose**: Get blockchain token balances directly

- **Input**: Wallet address, array of token IDs
- **Output**: Token balances from blockchain
- **Usage**: Direct on-chain balance checking

---

## 🎯 Ultimate Analysis Function

### `getComprehensiveWalletData(walletAddress)`

**Purpose**: **ONE-STOP** wallet analysis using only wallet address

- **Input**: Just wallet address
- **Output**: Complete profile including:
  - ✅ Current token holdings (blockchain)
  - ✅ Trading history (CLOB API)
  - ✅ Pending orders (CLOB API)
  - ✅ Earnings data (CLOB API)
  - ✅ Market activity analysis
  - ✅ Summary statistics
- **Usage**: Get EVERYTHING about a wallet in one call

---

## 🛠️ Utility Functions

### `getAvailableTokens()`

**Purpose**: Get all tradeable token addresses

- **Output**: USDC, YES tokens, NO tokens arrays
- **Usage**: Discover what tokens can be traded

### `cancelAllOrders()`

**Purpose**: Cancel all pending orders at once

- **Output**: Success status and count of cancelled orders
- **Usage**: Clear all open orders quickly

---

## 📋 Quick Reference

| **Want to...** | **Use Function** |
|-----------------|------------------|
| Buy YES/NO tokens | `placeOrder()` with side='buy' |
| Sell tokens | `placeOrder()` with side='sell' |
| Cancel orders | `cancelOrder()` or `cancelAllOrders()` |
| Claim winnings | `redeem()` |
| Check holdings | `getPositions()` |
| See order book | `getOrders()` |
| View trade history (raw) | `getTradingHistory()` |
| View trade history (with market titles) | `getTradingHistoryWithDetails()` |
| Analyze wallet completely | `getComprehensiveWalletData()` |
| Get market data | `getMarkets()` |

## 🚀 Key Features

- **✅ Proper Prediction Markets Semantics** - marketId ≠ outcomeTokenId
- **✅ Share-Based Positions** - No leverage, funding, or borrowing
- **✅ Full TypeScript Support** - All functions properly typed
- **✅ Error Handling** - Graceful fallbacks when APIs fail
- **✅ Debug Logging** - Set `POLYMARKET_DEBUG=true` for detailed logs
- **✅ Blockchain Fallback** - Direct on-chain queries when needed
- **✅ CLOB Integration** - Full Polymarket CLOB API access
- **✅ One-Address Discovery** - Complete wallet analysis from address only

## Schema Examples

### PredictionMarket

```typescript
{
  marketId: "123456789",
  chainId: "137",
  title: "Will X happen by Y?",
  status: "active",
  endTime: "2025-12-31T23:59:59Z",
  resolutionOutcome: null,
  outcomes: [
    { outcomeId: "yes", name: "Yes", tokenId: "token_yes", price: "0.65" },
    { outcomeId: "no", name: "No", tokenId: "token_no", price: "0.35" }
  ],
  volume: "1000000",
  liquidity: "50000"
}
```

### PredictionPosition

```typescript
{
  marketId: "123456789",
  outcomeId: "yes",
  tokenId: "token_yes",
  chainId: "137",
  walletAddress: "0x...",
  size: "100",  // 100 shares
  avgPrice: "0.60",
  currentPrice: "0.65",
  pnl: "5",  // $5 unrealized profit
  marketTitle: "Will X happen by Y?",
  outcomeName: "Yes"
}
```
