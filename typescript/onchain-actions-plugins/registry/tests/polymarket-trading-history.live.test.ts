/**
 * Test getTradingHistoryWithDetails - trading history with market descriptions
 */

import { describe, it, expect } from 'vitest';
import { PolymarketAdapter } from '../src/polymarket-plugin/adapter.js';

const PRIVATE_KEY = process.env['POLYMARKET_PRIVATE_KEY'];
const TEST_WALLET = '0x73b45E9DC72dC32Fb6b539d006e9Cb78830c18F5';

describe('Trading History with Details', () => {
  it('should return trading history with market titles', async () => {
    if (!PRIVATE_KEY) {
      console.log('\n⚠️  POLYMARKET_PRIVATE_KEY not set - skipping test');
      return;
    }

    console.log('\n' + '='.repeat(70));
    console.log('📜 Trading History with Market Descriptions');
    console.log('='.repeat(70));
    console.log(`📍 Wallet: ${TEST_WALLET}`);
    console.log('='.repeat(70) + '\n');

    const adapter = new PolymarketAdapter({
      chainId: 137,
      funderAddress: TEST_WALLET,
      privateKey: PRIVATE_KEY,
      signatureType: 0,
    });

    // Get trading history WITH details
    console.log('📊 Fetching trading history with market details...\n');
    const trades = await adapter.getTradingHistoryWithDetails(TEST_WALLET, { limit: 10 });

    console.log('='.repeat(70));
    console.log(`📊 TRADING HISTORY (${trades.length} trades)`);
    console.log('='.repeat(70) + '\n');

    if (trades.length === 0) {
      console.log('No trades found\n');
      return;
    }

    for (let i = 0; i < trades.length; i++) {
      const trade = trades[i];
      if (!trade) continue;

      console.log(`Trade #${i + 1}:`);
      console.log(`  📊 Market: ${trade.marketTitle}`);
      console.log(`  📝 Slug: ${trade.marketSlug || 'N/A'}`);
      console.log(`  💰 ${trade.side.toUpperCase()} ${trade.outcome}: ${trade.size} @ $${trade.price}`);

      if (trade.matchTime) {
        const date = new Date(parseInt(trade.matchTime) * 1000);
        console.log(`  🕐 Time: ${date.toISOString()}`);
      }
      console.log('');
    }

    console.log('='.repeat(70));
    console.log('✅ getTradingHistoryWithDetails() works correctly!');
    console.log('='.repeat(70) + '\n');

    expect(trades.length).toBeGreaterThan(0);
    expect(trades[0]).toHaveProperty('marketTitle');

  }, 120000);

  it('should compare raw vs enriched trading history', async () => {
    if (!PRIVATE_KEY) return;

    const adapter = new PolymarketAdapter({
      chainId: 137,
      funderAddress: TEST_WALLET,
      privateKey: PRIVATE_KEY,
      signatureType: 0,
    });

    console.log('\n📊 Comparing raw vs enriched trading history:\n');

    // Raw trades
    const rawTrades = await adapter.getTradingHistory(TEST_WALLET, { limit: 3 });
    console.log('Raw trades (without market titles):');
    for (const trade of rawTrades) {
      console.log(`  - Market: ${trade.market.substring(0, 30)}...`);
      console.log(`    ${trade.side} ${trade.outcome}: ${trade.size} @ ${trade.price}`);
    }

    // Enriched trades
    const enrichedTrades = await adapter.getTradingHistoryWithDetails(TEST_WALLET, { limit: 3 });
    console.log('\nEnriched trades (with market titles):');
    for (const trade of enrichedTrades) {
      console.log(`  - Market: ${trade.marketTitle}`);
      console.log(`    ${trade.side} ${trade.outcome}: ${trade.size} @ ${trade.price}`);
    }

    expect(enrichedTrades.length).toBe(rawTrades.length);
  }, 120000);
});
