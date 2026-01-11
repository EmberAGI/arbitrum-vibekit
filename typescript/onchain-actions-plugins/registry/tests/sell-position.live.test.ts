/**
 * Sell 25 YES shares of "Will Trump deport 750,000 or more people in 2025?"
 */

import { describe, it } from 'vitest';
import { PolymarketAdapter } from '../src/polymarket-plugin/adapter.js';

const PRIVATE_KEY = process.env['POLYMARKET_PRIVATE_KEY'];
const WALLET = '0x73b45E9DC72dC32Fb6b539d006e9Cb78830c18F5';

describe('Sell Position', () => {
  it('should sell 25 YES shares of Trump deportation market', async () => {
    if (!PRIVATE_KEY) {
      console.log('\n⚠️  POLYMARKET_PRIVATE_KEY not set');
      return;
    }

    const adapter = new PolymarketAdapter({
      chainId: 137,
      funderAddress: WALLET,
      privateKey: PRIVATE_KEY,
      signatureType: 0,
    });

    console.log('\n' + '='.repeat(60));
    console.log('📉 Selling 25 YES shares of Trump Deportation market');
    console.log('='.repeat(60));

    // First, get the market info to find market ID and current price
    const markets = await adapter.getMarkets({
      chainIds: ['137'],
      status: 'active',
      limit: 200,
    });

    // Look for "750,000 or more" specifically
    const market = markets.markets.find(
      (m) =>
        m.title.toLowerCase().includes('trump') &&
        m.title.toLowerCase().includes('deport') &&
        m.title.toLowerCase().includes('750,000 or more'),
    );

    if (!market) {
      console.log('❌ Market not found!');
      return;
    }

    console.log('');
    console.log('📊 Market Found:');
    console.log('   Title:', market.title);
    console.log('   Market ID:', market.marketId);

    const yesOutcome = market.outcomes.find((o) => o.outcomeId === 'yes');
    const noOutcome = market.outcomes.find((o) => o.outcomeId === 'no');

    console.log('   YES Price: $' + yesOutcome?.price);
    console.log('   NO Price: $' + noOutcome?.price);
    console.log('');

    // For SELL orders, we want to sell at current market price or slightly below
    // Current YES price is what buyers are paying - we sell at or near that
    const currentPrice = parseFloat(yesOutcome?.price || '0.05');
    // Round to 0.01 tick size
    const sellPrice = Math.floor(currentPrice * 100) / 100;

    console.log('📝 Placing SELL order:');
    console.log('   Side: SELL');
    console.log('   Outcome: YES');
    console.log('   Size: 25 shares');
    console.log('   Price: $' + sellPrice.toFixed(2));
    console.log('');

    try {
      const result = await adapter.placeOrder({
        chainId: '137',
        walletAddress: WALLET,
        marketId: market.marketId,
        outcomeId: 'yes',
        side: 'sell',
        size: '25',
        price: sellPrice.toString(),
      });

      if (result.success && result.orderId) {
        console.log('✅ SELL ORDER PLACED!');
        console.log('   Order ID:', result.orderId);
        console.log('');
        console.log('💰 Expected proceeds: ~$' + (25 * sellPrice).toFixed(2));
      } else {
        console.log('❌ Order failed:', (result as { error?: string }).error);
      }
    } catch (error) {
      console.log('❌ Error:', (error as Error).message);
    }

    console.log('');
    console.log('='.repeat(60) + '\n');
  }, 60000);
});
