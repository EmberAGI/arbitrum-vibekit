#!/usr/bin/env npx tsx
/**
 * Test Market Fetch Script
 *
 * Fetches markets from Polymarket's Gamma API and displays them.
 * This script doesn't require authentication - it uses public APIs only.
 *
 * Usage:
 *   npx tsx scripts/test-market-fetch.ts
 *   pnpm test:markets
 */

import { fetchMarketsFromGamma, fetchMarketPrices } from '../src/clients/polymarketClient.js';

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

  for (const market of markets.slice(0, 5)) {
    console.log();
    console.log(`📊 Market: ${market.name.substring(0, 70)}${market.name.length > 70 ? '...' : ''}`);
    console.log(`   YES Token: ${market.longToken.address.substring(0, 20)}...`);
    console.log(`   NO Token:  ${market.shortToken.address.substring(0, 20)}...`);

    // Fetch prices
    const prices = await fetchMarketPrices(market.longToken.address, market.shortToken.address);
    const spread = 1 - (prices.yesPrice + prices.noPrice);

    console.log(`   Prices: YES $${prices.yesPrice.toFixed(3)} | NO $${prices.noPrice.toFixed(3)}`);
    console.log(`   Spread: ${(spread * 100).toFixed(2)}% ${spread >= 0.02 ? '🔥 OPPORTUNITY!' : ''}`);
    console.log('───────────────────────────────────────────────────────────────────');
  }

  console.log();
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('✅ Market fetch test completed successfully!');
  console.log();
  console.log('📝 Summary:');
  console.log(`   - Total markets fetched: ${markets.length}`);
  console.log('   - Network: Polygon (Chain ID: 137)');
  console.log('   - API: Polymarket Gamma API');
  console.log();

  // Check for arbitrage opportunities
  const opportunities = [];
  for (const market of markets) {
    const prices = await fetchMarketPrices(market.longToken.address, market.shortToken.address);
    const spread = 1 - (prices.yesPrice + prices.noPrice);
    if (spread >= 0.02) {
      opportunities.push({ market, prices, spread });
    }
  }

  if (opportunities.length > 0) {
    console.log('🔥 Arbitrage Opportunities Found:');
    for (const opp of opportunities) {
      console.log(`   - ${opp.market.name.substring(0, 50)}... (${(opp.spread * 100).toFixed(2)}% spread)`);
    }
  } else {
    console.log('📈 No arbitrage opportunities found at the moment (spread >= 2%)');
  }

  console.log();
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
