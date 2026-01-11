# Polymarket Prediction Markets Plugin

A plugin for the Ember Plugin System that enables trading on Polymarket prediction markets through the CLOB (Central Limit Order Book) API.

## Overview

This plugin integrates Polymarket's prediction markets into the Ember ecosystem using proper prediction markets semantics. It allows agents to:

- Discover active prediction markets
- Place buy/sell orders on any outcome (YES/NO)
- Cancel pending orders
- Redeem winnings from resolved markets
- Query current positions and order history

## Architecture

The plugin uses prediction markets domain-accurate abstractions:

- **Markets** → Polymarket events with multiple outcomes (typically YES/NO)
- **Outcomes** → Individual betting options within a market, each with its own token
- **Positions** → User's outcome token holdings (share-based, no leverage)
- **Orders** → Pending CLOB orders to buy/sell outcome tokens

### Key Modeling Principles

1. **`marketId` ≠ `outcomeTokenId`** - These are separate concepts and never overloaded
2. **Share-based positions** - No leverage, funding fees, or borrowing mechanics
3. **Normalized prices** - Prices are in 0-1 probability range
4. **Explicit resolution** - Markets have clear resolution status and outcome

## Configuration

The plugin requires the following parameters:

```typescript
{
  host?: string;              // CLOB API host (default: https://clob.polymarket.com)
  chainId: number;            // Chain ID (137 for Polygon mainnet)
  funderAddress: string;      // Polygon address holding USDC for trading
  privateKey: string;         // Private key for signing orders
  signatureType?: number;     // 0 = EOA, 1 = Magic/email, 2 = browser wallet (default: 1)
  maxOrderSize?: number;      // Max shares per order (default: 100)
  maxOrderNotional?: number;  // Max USDC notional per order (default: 500)
  gammaApiUrl?: string;       // Gamma API for market data (default: https://gamma-api.polymarket.com)
  dataApiUrl?: string;        // Data API for user positions (default: https://data-api.polymarket.com)
}
```

## Actions

### `predictionMarkets-placeOrder`

Place a buy or sell order for any outcome in a market.

**Request:**
- `chainId` - Chain ID (137)
- `walletAddress` - Your wallet address
- `marketId` - Market identifier
- `outcomeId` - Outcome to trade ('yes', 'no', or token ID)
- `side` - 'buy' or 'sell'
- `size` - Number of shares
- `price` - Limit price (0-1 range, optional)

### `predictionMarkets-cancelOrder`

Cancel a pending order or all orders.

**Request:**
- `chainId` - Chain ID
- `walletAddress` - Your wallet address
- `orderId` - Order ID to cancel, or 'all' to cancel all

### `predictionMarkets-redeem`

Redeem winnings from a resolved market.

**Request:**
- `chainId` - Chain ID
- `walletAddress` - Your wallet address
- `marketId` - Market identifier
- `outcomeId` - Outcome to redeem (optional)
- `amount` - Amount to redeem (optional)

## Queries

### `getMarkets`

Get available prediction markets with optional filtering.

**Request:**
- `chainIds` - Array of chain IDs
- `status` - Filter by status ('active', 'resolved', 'voided', 'paused')
- `category` - Filter by category
- `searchQuery` - Search market titles
- `limit` / `offset` - Pagination

### `getPositions`

Get user's positions in prediction markets.

**Request:**
- `walletAddress` - User's wallet address
- `marketIds` - Filter by specific markets (optional)
- `includeResolved` - Include settled positions (optional)

### `getOrders`

Get user's pending orders.

**Request:**
- `walletAddress` - User's wallet address
- `marketIds` - Filter by specific markets (optional)
- `status` - Filter by order status (optional)

## Usage

```typescript
import { registerPolymarket, initializePublicRegistry } from '@emberai/onchain-actions-registry';

const chainConfig = {
  chainId: 137, // Polygon
  rpcUrl: 'https://polygon-rpc.com',
  wrappedNativeToken: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', // WMATIC
};

const registry = initializePublicRegistry([chainConfig]);

registerPolymarket(chainConfig, registry, {
  funderAddress: '0x...', // Your Polygon address with USDC
  privateKey: '0x...',    // Private key for signing orders
  signatureType: 0,       // 0 = EOA/raw private key (default), 1 = Magic/email, 2 = browser wallet
  maxOrderSize: 100,      // Max shares per order
  maxOrderNotional: 500,  // Max USDC notional per order
  gammaApiUrl: 'https://gamma-api.polymarket.com', // Optional
  dataApiUrl: 'https://data-api.polymarket.com',   // Optional
});
```

## Advanced Usage

The adapter exposes additional methods for comprehensive wallet analysis:

```typescript
const adapter = new PolymarketAdapter(params);

// Get complete wallet analysis in one call
const walletData = await adapter.getComprehensiveWalletData('0x...');

// Get trading history (raw)
const trades = await adapter.getTradingHistory('0x...');

// Get trading history with market titles and descriptions
const tradesWithDetails = await adapter.getTradingHistoryWithDetails('0x...');

// Get earnings data
const earnings = await adapter.getUserEarnings('2025-01-11');

// Get price history
const prices = await adapter.getPriceHistory({ market: 'market-id', interval: '1h' });

// Get market trades
const marketTrades = await adapter.getMarketTrades('condition-id');

// Direct blockchain balance query
const balances = await adapter.getTokenBalances('0x...', ['tokenId1', 'tokenId2']);
```

## API Endpoints Used

- **Gamma API**: `https://gamma-api.polymarket.com/markets` - Market data and metadata
- **CLOB API**: `https://clob.polymarket.com` - Order placement and cancellation
- **Data API**: `https://data-api.polymarket.com` - User positions and balances

## Notes

- Polymarket operates on **Polygon (chain ID 137)**
- The CLOB is an **off-chain order matching system**
- Orders are signed and posted via REST API - **no gas needed for placing/canceling orders**
- Settlement occurs on-chain after market resolution

### Contract Addresses (Polygon Mainnet)

| Contract | Address | Purpose |
|----------|---------|---------|
| USDC.e (Bridged USDC) | `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174` | Quote token for trading |
| CTF Exchange | `0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E` | Order execution & settlement |
| CTF Contract | `0x4D97DCd97eC945f40cF65F87097ACe5EA0476045` | Holds ERC-1155 outcome tokens |
| Neg Risk Adapter | `0xC5d563A36AE78145C45a50134d48A1215220f80a` | For negRisk markets |

### Important Notes

- Market data is cached to reduce API calls
- Position fetching falls back to blockchain query if APIs are unavailable
- **One-time setup required**: Visit polymarket.com and "Enable Trading" to register your wallet with the CLOB system before placing orders
- Use USDC.e (bridged USDC), NOT native USDC on Polygon

## Schemas

The plugin uses proper prediction markets schemas:

- `PredictionMarket` - Market with outcomes, status, resolution info
- `PredictionOutcome` - Outcome with token ID, price, probability
- `PredictionPosition` - Share-based position without leverage
- `PredictionOrder` - Order with market/outcome context

## References

- [Polymarket CLOB Client](https://github.com/Polymarket/clob-client)
- [Polymarket API Documentation](https://docs.polymarket.com/)
- [Ember Plugin System](../README.md)
