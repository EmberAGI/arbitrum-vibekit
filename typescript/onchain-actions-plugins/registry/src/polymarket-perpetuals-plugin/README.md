# Polymarket Perpetuals Plugin

A plugin for the Ember Plugin System that enables trading on Polymarket prediction markets through the CLOB (Central Limit Order Book) API.

## Overview

This plugin integrates Polymarket's prediction markets into the Ember ecosystem, allowing agents to:
- Discover active prediction markets
- Place long positions (BUY YES tokens)
- Place short positions (BUY NO tokens)
- Cancel pending orders
- Query current positions and order history

## Architecture

The plugin maps Polymarket's prediction market model to the Ember perpetuals plugin type:
- **Long positions** → BUY YES tokens (betting on an outcome)
- **Short positions** → BUY NO tokens (betting against an outcome)
- **Markets** → Polymarket events with YES/NO token pairs
- **Positions** → User's YES/NO token holdings
- **Orders** → Pending CLOB orders

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

## Implementation Status

✅ **Fully Implemented Features:**

1. **Market Data Integration**: ✅ Complete
   - Fetches active markets from Polymarket's Gamma API
   - Retrieves market metadata (tickSize, negRisk, liquidity)
   - Maps YES/NO token pairs for input/output token mapping
   - Implements market caching for performance

2. **Position Tracking**: ✅ Complete
   - Fetches positions from Polymarket's Data API
   - Falls back to CLOB if Data API unavailable
   - Maps YES/NO token holdings to PerpetualsPosition format
   - Calculates position sizes and PnL structure

3. **Order Management**: ✅ Complete
   - Queries pending orders from CLOB ledger API
   - Maps CLOB orders to PerpetualsOrder format
   - Implements order cancellation via CLOB DELETE endpoint

4. **Action Implementation**: ✅ Complete
   - Long positions (BUY YES tokens) with market validation
   - Short positions (BUY NO tokens) with automatic token lookup
   - Order cancellation with proper error handling
   - Dynamic input/output token population from active markets

## Features

- **Market Discovery**: Query active prediction markets with filtering
- **Position Management**: Track YES/NO token holdings and PnL
- **Order Execution**: Place limit orders with risk limits
- **Order Cancellation**: Cancel pending orders
- **Risk Controls**: Configurable max order size and notional limits
- **Market Caching**: Reduces API calls for better performance

## Usage

```typescript
import { registerPolymarket } from '@emberai/onchain-actions-registry';
import { initializePublicRegistry } from '@emberai/onchain-actions-registry';

const chainConfig = {
  chainId: 137, // Polygon
  rpcUrl: 'https://polygon-rpc.com',
  wrappedNativeToken: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', // WMATIC
};

const registry = initializePublicRegistry([chainConfig]);

registerPolymarket(chainConfig, registry, {
  funderAddress: '0x...', // Your Polygon address with USDC
  privateKey: '0x...',    // Private key for signing orders
  signatureType: 1,       // 1 = Magic/email login
  maxOrderSize: 100,      // Max shares per order
  maxOrderNotional: 500,  // Max USDC notional per order
  gammaApiUrl: 'https://gamma-api.polymarket.com', // Optional: custom Gamma API URL
  dataApiUrl: 'https://data-api.polymarket.com',   // Optional: custom Data API URL
});
```

## API Endpoints Used

- **Gamma API**: `https://gamma-api.polymarket.com/markets` - Market data and metadata
- **CLOB API**: `https://clob.polymarket.com` - Order placement and cancellation
- **Data API**: `https://data-api.polymarket.com` - User positions and balances

## Notes

- Polymarket operates on **Polygon (chain ID 137)**
- The CLOB is an **off-chain order matching system**
- Orders are signed and posted via REST API
- Settlement occurs on-chain after market resolution
- This plugin bridges the off-chain CLOB with Ember's on-chain transaction model
- **USDC Address**: `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174` (Polygon mainnet)
- Market data is cached to reduce API calls
- Position fetching falls back to CLOB if Data API is unavailable

## References

- [Polymarket CLOB Client](https://github.com/Polymarket/clob-client)
- [Polymarket API Documentation](https://docs.polymarket.com/)
- [Ember Plugin System](../README.md)

