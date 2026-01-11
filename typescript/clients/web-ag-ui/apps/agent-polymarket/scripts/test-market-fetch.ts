#!/usr/bin/env npx tsx
/**
 * Test Market Fetch Script
 *
 * Fetches markets from Polymarket's Gamma API and displays them with full price data.
 * This script doesn't require authentication - it uses public APIs only.
 *
 * Price Types Explained:
 * - BUY price (ask): What you pay to buy tokens (best offer from sellers)
 * - SELL price (bid): What you receive when selling tokens (best bid from buyers)
 * - Midpoint: Average of bid and ask (represents market consensus)
 *
 * Usage:
 *   npx tsx scripts/test-market-fetch.ts
 *   pnpm test:markets
 */

import {
  fetchMarketsFromGamma,
  fetchMarketPrices,
  type PerpetualMarket,
  type MarketPrices,
} from '../src/clients/index.js';

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║         Polymarket Market Fetch Test                              ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log();

  console.log('📡 Fetching markets from Gamma API...\n');

  const markets = await fetchMarketsFromGamma(10);

  if (markets.length === 0) {
    console.log('❌ No markets returned. Check your network connection.');
    process.exit(1);
  }

  console.log(`✅ Successfully fetched ${markets.length} markets!\n`);
  console.log('═══════════════════════════════════════════════════════════════════');

  console.log('\n📖 Price Guide:');
  console.log('   BUY = Price to buy tokens (best ask from sellers)');
  console.log('   SELL = Price to sell tokens (best bid from buyers)');
  console.log('   MID = Midpoint between bid/ask (market consensus)');
  console.log('   0.000 = No orders on that side of the book\n');

  for (const market of markets.slice(0, 5)) {
    console.log();
    console.log(`📊 Market: ${market.name.substring(0, 70)}${market.name.length > 70 ? '...' : ''}`);
    console.log(`   YES Token: ${market.longToken.address.substring(0, 20)}...`);
    console.log(`   NO Token:  ${market.shortToken.address.substring(0, 20)}...`);

    // Fetch full price data
    const prices = await fetchMarketPrices(market.longToken.address, market.shortToken.address);

    // Display all prices
    console.log(`   ┌─────────────────────────────────────────────────────────┐`);
    console.log(`   │ Token │   BUY   │  SELL   │   MID   │                   │`);
    console.log(`   ├───────┼─────────┼─────────┼─────────┤                   │`);
    console.log(
      `   │  YES  │  $${prices.yesBuyPrice.toFixed(3)}  │  $${prices.yesSellPrice.toFixed(3)}  │  $${prices.yesMidpoint.toFixed(3)}  │${prices.yesBuyPrice === 0 ? ' ⚠️ No sellers' : ''}                   │`,
    );
    console.log(
      `   │  NO   │  $${prices.noBuyPrice.toFixed(3)}  │  $${prices.noSellPrice.toFixed(3)}  │  $${prices.noMidpoint.toFixed(3)}  │${prices.noBuyPrice === 0 ? ' ⚠️ No sellers' : ''}                   │`,
    );
    console.log(`   └─────────────────────────────────────────────────────────┘`);

    // Calculate spreads
    const buySpread = 1 - (prices.yesBuyPrice + prices.noBuyPrice);
    const midSpread = 1 - (prices.yesMidpoint + prices.noMidpoint);

    console.log(`   Spreads: Buy ${(buySpread * 100).toFixed(2)}% | Mid ${(midSpread * 100).toFixed(2)}%`);

    if (buySpread >= 0.02 && prices.yesBuyPrice > 0 && prices.noBuyPrice > 0) {
      console.log(`   🔥 ARBITRAGE OPPORTUNITY! Buy both YES and NO for guaranteed profit!`);
    }

    console.log('───────────────────────────────────────────────────────────────────');
  }

  console.log();
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('✅ Market fetch test completed successfully!');
  console.log();
  console.log('📝 Summary:');
  console.log(`   - Total markets fetched: ${markets.length}`);
  console.log('   - Network: Polygon (Chain ID: 137)');
  console.log('   - API: Polymarket Gamma API + CLOB API');
  console.log();

  // Check for arbitrage opportunities (only when both sides have liquidity)
  const opportunities: { market: PerpetualMarket; prices: MarketPrices; spread: number }[] = [];
  for (const market of markets) {
    const prices = await fetchMarketPrices(market.longToken.address, market.shortToken.address);
    // Only consider real opportunities where both tokens have sellers
    if (prices.yesBuyPrice > 0 && prices.noBuyPrice > 0) {
      const spread = 1 - (prices.yesBuyPrice + prices.noBuyPrice);
      if (spread >= 0.02) {
        opportunities.push({ market, prices, spread });
      }
    }
  }

  if (opportunities.length > 0) {
    console.log('🔥 Real Arbitrage Opportunities (both sides have liquidity):');
    for (const opp of opportunities) {
      console.log(
        `   - ${opp.market.name.substring(0, 50)}... (${(opp.spread * 100).toFixed(2)}% spread)`,
      );
      console.log(
        `     YES BUY: $${opp.prices.yesBuyPrice.toFixed(3)} | NO BUY: $${opp.prices.noBuyPrice.toFixed(3)}`,
      );
    }
  } else {
    console.log('📈 No real arbitrage opportunities found at the moment (spread >= 2% with liquidity)');
  }

  console.log('\n📊 Price Types Available from Polymarket CLOB API:');
  console.log('   /price?token_id=X&side=buy  → Best ASK (price to BUY tokens)');
  console.log('   /price?token_id=X&side=sell → Best BID (price to SELL tokens)');
  console.log('   /midpoint?token_id=X        → Midpoint of bid/ask');
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
