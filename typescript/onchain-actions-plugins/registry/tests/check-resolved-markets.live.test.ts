/**
 * Check for resolved markets where user may have winnings to redeem
 */

import { describe, it } from 'vitest';
import { PolymarketAdapter } from '../src/polymarket-plugin/adapter.js';

const PRIVATE_KEY = process.env['POLYMARKET_PRIVATE_KEY'];
const TEST_WALLET = '0x73b45E9DC72dC32Fb6b539d006e9Cb78830c18F5';

describe('Check Resolved Markets for Redemption', () => {
  it('should check if any traded markets are resolved', async () => {
    if (!PRIVATE_KEY) {
      console.log('\n⚠️  POLYMARKET_PRIVATE_KEY not set - skipping test');
      return;
    }

    console.log('\n' + '='.repeat(70));
    console.log('🏆 Checking for Resolved Markets & Winnings');
    console.log('='.repeat(70));
    console.log(`📍 Wallet: ${TEST_WALLET}`);
    console.log('='.repeat(70) + '\n');

    const adapter = new PolymarketAdapter({
      chainId: 137,
      funderAddress: TEST_WALLET,
      privateKey: PRIVATE_KEY,
      signatureType: 0,
    });

    // 1. Get trading history to find markets user traded
    console.log('📊 Step 1: Fetching your trading history...\n');
    const trades = await adapter.getTradingHistory(TEST_WALLET, { limit: 50 });

    if (trades.length === 0) {
      console.log('❌ No trading history found.\n');
      return;
    }

    console.log(`Found ${trades.length} trades\n`);

    // Get unique market IDs (condition IDs) from trades
    const tradedMarkets = new Set<string>();
    const tradesByMarket = new Map<string, typeof trades>();

    for (const trade of trades) {
      tradedMarkets.add(trade.market);
      const existing = tradesByMarket.get(trade.market) || [];
      existing.push(trade);
      tradesByMarket.set(trade.market, existing);
    }

    console.log(`Markets traded: ${tradedMarkets.size}\n`);

    // 2. Check each market's status
    console.log('📊 Step 2: Checking market resolution status...\n');

    // Get resolved markets
    const resolvedMarketsResponse = await adapter.getMarkets({
      chainIds: ['137'],
      status: 'resolved',
      limit: 200
    });

    console.log(`Total resolved markets on Polymarket: ${resolvedMarketsResponse.markets.length}\n`);

    // 3. Check if any of user's traded markets are resolved
    console.log('='.repeat(70));
    console.log('📋 YOUR TRADED MARKETS STATUS');
    console.log('='.repeat(70) + '\n');

    let resolvedCount = 0;
    let potentialWinnings = 0;

    for (const [marketId, marketTrades] of tradesByMarket.entries()) {
      console.log(`Market: ${marketId.substring(0, 40)}...`);
      console.log(`  Trades: ${marketTrades.length}`);

      // Calculate total shares bought
      let yesShares = 0;
      let noShares = 0;
      let totalSpent = 0;

      for (const trade of marketTrades) {
        const size = parseFloat(trade.size);
        const price = parseFloat(trade.price);
        totalSpent += size * price;

        if (trade.outcome === 'Yes') {
          yesShares += trade.side === 'BUY' ? size : -size;
        } else {
          noShares += trade.side === 'BUY' ? size : -size;
        }
      }

      console.log(`  YES shares: ${yesShares}`);
      console.log(`  NO shares: ${noShares}`);
      console.log(`  Total spent: $${totalSpent.toFixed(4)}`);

      // Try to find this market in resolved markets
      const resolved = resolvedMarketsResponse.markets.find(m =>
        m.marketId === marketId ||
        m.slug === marketId ||
        m.outcomes.some(o => o.tokenId === marketId)
      );

      if (resolved) {
        resolvedCount++;
        console.log(`  ✅ STATUS: RESOLVED`);
        console.log(`  Resolution: ${resolved.resolutionOutcome || 'Unknown'}`);

        // Check if user would have won
        if (resolved.resolutionOutcome === 'Yes' && yesShares > 0) {
          console.log(`  🎉 YOU WON! ${yesShares} YES shares = $${yesShares.toFixed(2)}`);
          potentialWinnings += yesShares;
        } else if (resolved.resolutionOutcome === 'No' && noShares > 0) {
          console.log(`  🎉 YOU WON! ${noShares} NO shares = $${noShares.toFixed(2)}`);
          potentialWinnings += noShares;
        } else {
          console.log(`  ❌ No winnings (wrong outcome)`);
        }
      } else {
        console.log(`  ⏳ STATUS: ACTIVE/PENDING`);
      }

      console.log('');
    }

    // 4. Summary
    console.log('='.repeat(70));
    console.log('📊 REDEMPTION SUMMARY');
    console.log('='.repeat(70));
    console.log(`\nMarkets traded: ${tradedMarkets.size}`);
    console.log(`Markets resolved: ${resolvedCount}`);
    console.log(`Potential winnings: $${potentialWinnings.toFixed(2)}`);

    if (resolvedCount === 0) {
      console.log('\n⏳ None of your markets have resolved yet.');
      console.log('   Check back later when markets expire!\n');
    } else if (potentialWinnings > 0) {
      console.log('\n🎉 You have winnings to redeem!');
      console.log('   Use the redeem() function to claim them.\n');
    }

    console.log('='.repeat(70) + '\n');

  }, 120000);
});
