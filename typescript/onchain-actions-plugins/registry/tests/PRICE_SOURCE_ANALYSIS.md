# Price Source Analysis for Polymarket Adapter

## 📊 Where Prices Come From

### 1. **Mid Price (Current Price)** - From Gamma API

**Source**: `gamma-api.polymarket.com/markets`

**Flow**:
```
Gamma API → outcomePrices (JSON string) → parseOutcomePrices() → price field
```

**Code Location**:
- **API Call**: `adapter.ts` line 753: `fetch(${this.gammaApiUrl}/markets?...)`
- **Response Field**: `PolymarketMarketRaw.outcomePrices` (line 111)
  - Format: JSON string like `'["0.5", "0.5"]'` (YES price, NO price)
- **Parser Function**: `parseOutcomePrices()` (line 156)
- **Usage**: `getMarkets()` function (line 791)
  ```typescript
  const prices = parseOutcomePrices(m.outcomePrices);
  price: prices?.yes ?? '0.5',  // Line 810
  ```

**What it is**: This is the **mid-market price** (average of bid/ask) from Polymarket's Gamma API.

---

### 2. **Bid/Ask Prices (Buy/Sell Prices)** - NOT Available in Adapter

**Problem**: The adapter does NOT have a function to get bid/ask prices!

**Current Status**:
- ❌ No `getOrderBook()` function in adapter
- ❌ No `getBidAsk()` function in adapter
- ❌ CLOB API endpoint `/book?token_id=...` returns error: `"No orderbook exists for the requested token id"`

**What the test is trying**:
- Test file tries to call `https://clob.polymarket.com/book?token_id=${tokenId}` directly
- This API endpoint doesn't work (returns error)
- The CLOB client library might have methods, but they're not exposed in the adapter

---

## 🔍 Available Price Functions in Adapter

### ✅ `getPriceHistory()` - Line 1274
```typescript
async getPriceHistory(options: {
  market?: string;
  startTs?: number;
  endTs?: number;
  fidelity?: number;
  interval?: string;
}): Promise<MarketPrice[]>
```
- **Source**: CLOB client's `getPricesHistory()` method
- **Returns**: Historical price data (time series)
- **NOT**: Current bid/ask prices

---

## 📋 Summary

| Price Type | Source | Available in Adapter? | Function |
|------------|--------|----------------------|----------|
| **Mid Price** | Gamma API (`outcomePrices`) | ✅ YES | `getMarkets()` → `parseOutcomePrices()` |
| **Bid Price** | CLOB Order Book | ❌ NO | Not implemented |
| **Ask Price** | CLOB Order Book | ❌ NO | Not implemented |
| **Price History** | CLOB Client | ✅ YES | `getPriceHistory()` |

---

## 🎯 The Issue

The test is showing **$0.99/$0.01** for bid/ask because:
1. The CLOB API `/book` endpoint doesn't work (returns error)
2. The adapter doesn't have a function to get order book data
3. The test is likely getting invalid/fallback data

**Solution Needed**:
- Either add a `getOrderBook()` function to the adapter that uses CLOB client methods
- Or find the correct API endpoint/method to get bid/ask prices
- Or use a different data source for order book information
