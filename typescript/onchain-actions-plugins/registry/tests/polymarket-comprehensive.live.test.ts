/**
 * POLYMARKET COMPREHENSIVE LIVE TEST
 *
 * This test places multiple orders on different markets:
 * - Orders that fill immediately (market price)
 * - Orders that stay pending (low limit price)
 * - Both YES and NO tokens
 *
 * Then shows the full portfolio summary.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { PolymarketAdapter } from '../src/polymarket-plugin/adapter.js';

const TEST_WALLET_ADDRESS = '0x73b45E9DC72dC32Fb6b539d006e9Cb78830c18F5';
const PRIVATE_KEY = process.env['POLYMARKET_PRIVATE_KEY'];

// Skip if no private key
const skipTests = !PRIVATE_KEY;

interface TestContext {
  adapter: PolymarketAdapter;
  markets: Array<{
    marketId: string;
    title: string;
    yesTokenId: string;
    noTokenId: string;
    yesPrice: string;
    noPrice: string;
  }>;
  ordersPlaced: Array<{
    marketTitle: string;
    outcome: string;
    orderId: string | undefined;
    status: string;
    filled: boolean;
  }>;
}

const ctx: TestContext = {
  adapter: null as unknown as PolymarketAdapter,
  markets: [],
  ordersPlaced: [],
};

describe('Polymarket Comprehensive Live Test', () => {
  beforeAll(() => {
    if (skipTests) {
      console.log('\n' + '='.repeat(70));
      console.log('POLYMARKET_PRIVATE_KEY NOT SET - TESTS SKIPPED');
      console.log('='.repeat(70) + '\n');
      return;
    }

    ctx.adapter = new PolymarketAdapter({
      chainId: 137,
      funderAddress: TEST_WALLET_ADDRESS,
      privateKey: PRIVATE_KEY!,
      maxOrderSize: 100,
      maxOrderNotional: 500,
    });

    console.log('\n' + '='.repeat(70));
    console.log('POLYMARKET COMPREHENSIVE LIVE TEST');
    console.log('='.repeat(70));
    console.log(`Wallet: ${TEST_WALLET_ADDRESS}`);
    console.log('='.repeat(70) + '\n');
  });

  it('Step 1: Select 2 active markets for testing', async () => {
    if (skipTests) return;

    console.log('Fetching active markets...');
    const result = await ctx.adapter.getMarkets({ chainIds: ['137'], limit: 50, status: 'active' });

    // Find markets with good liquidity, reasonable prices, high IDs, and NOT negRisk
    const suitableMarkets = result.markets
      .filter(m => {
        const yesPrice = parseFloat(m.outcomes.find(o => o.outcomeId === 'yes')?.price || '0');
        const noPrice = parseFloat(m.outcomes.find(o => o.outcomeId === 'no')?.price || '0');
        const marketIdNum = parseInt(m.marketId);
        // Markets with high IDs (active), reasonable prices, non-negRisk
        // negRisk markets require different contract handling
        const isNegRisk = (m as { negRisk?: boolean }).negRisk === true;
        return marketIdNum > 100000 && // Active markets have high IDs
               !isNegRisk && // Exclude negRisk markets
               yesPrice > 0.01 && yesPrice < 0.99 &&
               noPrice > 0.01 && noPrice < 0.99 &&
               m.status === 'active';
      })
      .slice(0, 2);

    expect(suitableMarkets.length).toBeGreaterThanOrEqual(2);

    for (const market of suitableMarkets) {
      const yesOutcome = market.outcomes.find(o => o.outcomeId === 'yes')!;
      const noOutcome = market.outcomes.find(o => o.outcomeId === 'no')!;

      ctx.markets.push({
        marketId: market.marketId,
        title: market.title,
        yesTokenId: yesOutcome.tokenId!,
        noTokenId: noOutcome.tokenId!,
        yesPrice: yesOutcome.price!,
        noPrice: noOutcome.price!,
      });

      console.log(`\nMarket ${ctx.markets.length}: ${market.title.substring(0, 60)}...`);
      console.log(`  ID: ${market.marketId}`);
      console.log(`  YES Price: $${yesOutcome.price} | NO Price: $${noOutcome.price}`);
    }
  }, 30000);

  it('Step 2: Place fillable YES order on Market 1 (at market price)', async () => {
    if (skipTests || ctx.markets.length < 1) return;

    const market = ctx.markets[0]!;
    // Place order at slightly above market price to ensure fill
    const fillPrice = Math.min(0.99, parseFloat(market.yesPrice) + 0.05).toFixed(2);

    // Calculate size to ensure order value > $1 minimum
    const orderSize = Math.max(20, Math.ceil(2 / parseFloat(fillPrice)));
    console.log(`\nPlacing fillable YES order on: ${market.title.substring(0, 50)}...`);
    console.log(`  Price: $${fillPrice} (market: $${market.yesPrice})`);
    console.log(`  Size: ${orderSize} shares (value: $${(orderSize * parseFloat(fillPrice)).toFixed(2)})`);

    const result = await ctx.adapter.placeOrder({
      marketId: market.marketId,
      outcomeId: 'yes',
      side: 'buy',
      size: String(orderSize),
      price: fillPrice,
      chainId: '137',
      walletAddress: TEST_WALLET_ADDRESS,
    });

    console.log(`  Result: ${result.success ? 'SUCCESS' : 'FAILED'}`);
    if (result.orderId) console.log(`  Order ID: ${result.orderId}`);
    if (result.error) console.log(`  Error: ${result.error}`);

    ctx.ordersPlaced.push({
      marketTitle: market.title,
      outcome: 'YES',
      orderId: result.orderId,
      status: result.success ? 'placed' : 'failed',
      filled: !!(result.success && !result.error),
    });

    expect(result.success).toBe(true);
  }, 30000);

  it('Step 3: Place pending NO order on Market 1 (low limit price)', async () => {
    if (skipTests || ctx.markets.length < 1) return;

    const market = ctx.markets[0]!;
    // Place order at very low price to stay as pending
    const pendingPrice = '0.05';

    console.log(`\nPlacing pending NO order on: ${market.title.substring(0, 50)}...`);
    console.log(`  Price: $${pendingPrice} (market: $${market.noPrice})`);
    console.log(`  Size: 10 shares`);

    const result = await ctx.adapter.placeOrder({
      marketId: market.marketId,
      outcomeId: 'no',
      side: 'buy',
      size: '10',
      price: pendingPrice,
      chainId: '137',
      walletAddress: TEST_WALLET_ADDRESS,
    });

    console.log(`  Result: ${result.success ? 'SUCCESS' : 'FAILED'}`);
    if (result.orderId) console.log(`  Order ID: ${result.orderId}`);
    if (result.error) console.log(`  Error: ${result.error}`);

    ctx.ordersPlaced.push({
      marketTitle: market.title,
      outcome: 'NO',
      orderId: result.orderId,
      status: result.success ? 'placed' : 'failed',
      filled: false, // Low price = should stay pending
    });

    expect(result.success).toBe(true);
  }, 30000);

  it('Step 4: Place fillable YES order on Market 2 (at market price)', async () => {
    if (skipTests || ctx.markets.length < 2) return;

    const market = ctx.markets[1]!;
    const fillPrice = Math.min(0.99, parseFloat(market.yesPrice) + 0.05).toFixed(2);

    // Calculate size to ensure order value > $1 minimum
    const orderSize = Math.max(20, Math.ceil(2 / parseFloat(fillPrice)));
    console.log(`\nPlacing fillable YES order on: ${market.title.substring(0, 50)}...`);
    console.log(`  Price: $${fillPrice} (market: $${market.yesPrice})`);
    console.log(`  Size: ${orderSize} shares (value: $${(orderSize * parseFloat(fillPrice)).toFixed(2)})`);

    const result = await ctx.adapter.placeOrder({
      marketId: market.marketId,
      outcomeId: 'yes',
      side: 'buy',
      size: String(orderSize),
      price: fillPrice,
      chainId: '137',
      walletAddress: TEST_WALLET_ADDRESS,
    });

    console.log(`  Result: ${result.success ? 'SUCCESS' : 'FAILED'}`);
    if (result.orderId) console.log(`  Order ID: ${result.orderId}`);
    if (result.error) console.log(`  Error: ${result.error}`);

    ctx.ordersPlaced.push({
      marketTitle: market.title,
      outcome: 'YES',
      orderId: result.orderId,
      status: result.success ? 'placed' : 'failed',
      filled: !!(result.success && !result.error),
    });

    expect(result.success).toBe(true);
  }, 30000);

  it('Step 5: Place pending NO order on Market 2 (low limit price)', async () => {
    if (skipTests || ctx.markets.length < 2) return;

    const market = ctx.markets[1]!;
    const pendingPrice = '0.05';

    console.log(`\nPlacing pending NO order on: ${market.title.substring(0, 50)}...`);
    console.log(`  Price: $${pendingPrice} (market: $${market.noPrice})`);
    console.log(`  Size: 10 shares`);

    const result = await ctx.adapter.placeOrder({
      marketId: market.marketId,
      outcomeId: 'no',
      side: 'buy',
      size: '10',
      price: pendingPrice,
      chainId: '137',
      walletAddress: TEST_WALLET_ADDRESS,
    });

    console.log(`  Result: ${result.success ? 'SUCCESS' : 'FAILED'}`);
    if (result.orderId) console.log(`  Order ID: ${result.orderId}`);
    if (result.error) console.log(`  Error: ${result.error}`);

    ctx.ordersPlaced.push({
      marketTitle: market.title,
      outcome: 'NO',
      orderId: result.orderId,
      status: result.success ? 'placed' : 'failed',
      filled: false,
    });

    expect(result.success).toBe(true);
  }, 30000);

  it('Step 6: Get full portfolio summary with all positions and orders', async () => {
    if (skipTests) return;

    console.log('\n' + '='.repeat(70));
    console.log('FETCHING PORTFOLIO SUMMARY...');
    console.log('='.repeat(70));

    const portfolio = await ctx.adapter.getPortfolioSummary(TEST_WALLET_ADDRESS);

    console.log('\n' + '='.repeat(70));
    console.log('PORTFOLIO SUMMARY');
    console.log('='.repeat(70));
    console.log(`Wallet: ${TEST_WALLET_ADDRESS}`);
    console.log(`Total Positions (token holdings): ${portfolio.totalPositions}`);
    console.log(`Total Open Orders: ${portfolio.totalOpenOrders}`);
    console.log(`Markets with Activity: ${portfolio.markets.length}`);
    console.log('='.repeat(70));

    if (portfolio.markets.length > 0) {
      console.log('\nPOSITIONS BY MARKET:\n');

      for (const market of portfolio.markets) {
        console.log('-'.repeat(70));
        console.log(`Market: ${market.title}`);
        console.log(`ID: ${market.marketId} | Status: ${market.status.toUpperCase()}`);
        console.log('-'.repeat(70));

        // YES Token
        const yesBalance = parseInt(market.yesToken.balance);
        const yesTokens = yesBalance / 1_000_000; // Convert from raw to tokens
        console.log('\n  YES TOKEN:');
        console.log(`    Balance: ${yesTokens.toFixed(6)} tokens (raw: ${yesBalance.toLocaleString()})`);
        console.log(`    Current Price: $${market.yesToken.currentPrice}`);
        console.log(`    Pending BUY Orders: ${market.yesToken.pendingBuyOrders}`);
        console.log(`    Pending SELL Orders: ${market.yesToken.pendingSellOrders}`);
        if (yesBalance > 0) {
          const yesValue = yesTokens * parseFloat(market.yesToken.currentPrice);
          console.log(`    Estimated Value: $${yesValue.toFixed(4)}`);
        }

        // NO Token
        const noBalance = parseInt(market.noToken.balance);
        const noTokens = noBalance / 1_000_000;
        console.log('\n  NO TOKEN:');
        console.log(`    Balance: ${noTokens.toFixed(6)} tokens (raw: ${noBalance.toLocaleString()})`);
        console.log(`    Current Price: $${market.noToken.currentPrice}`);
        console.log(`    Pending BUY Orders: ${market.noToken.pendingBuyOrders}`);
        console.log(`    Pending SELL Orders: ${market.noToken.pendingSellOrders}`);
        if (noBalance > 0) {
          const noValue = noTokens * parseFloat(market.noToken.currentPrice);
          console.log(`    Estimated Value: $${noValue.toFixed(4)}`);
        }

        // Total market value
        const totalValue = (yesTokens * parseFloat(market.yesToken.currentPrice)) +
                          (noTokens * parseFloat(market.noToken.currentPrice));
        if (totalValue > 0) {
          console.log(`\n  TOTAL MARKET VALUE: $${totalValue.toFixed(4)}`);
        }
        console.log('');
      }
    } else {
      console.log('\nNo positions or orders found!');
    }

    console.log('='.repeat(70));
    console.log('ORDERS PLACED IN THIS TEST:');
    console.log('='.repeat(70));
    for (const order of ctx.ordersPlaced) {
      console.log(`  ${order.outcome} on "${order.marketTitle.substring(0, 40)}..."`);
      console.log(`    Status: ${order.status} | Filled: ${order.filled ? 'YES' : 'NO (pending)'}`);
      if (order.orderId) console.log(`    Order ID: ${order.orderId}`);
    }
    console.log('='.repeat(70) + '\n');

    expect(portfolio.markets.length).toBeGreaterThan(0);
  }, 180000);

  it('Step 7: Show trading history', async () => {
    if (skipTests) return;

    console.log('\n' + '='.repeat(70));
    console.log('TRADING HISTORY');
    console.log('='.repeat(70));

    const trades = await ctx.adapter.getTradingHistory(TEST_WALLET_ADDRESS, { limit: 10 });

    if (trades.length > 0) {
      for (const trade of trades) {
        console.log(`\nTrade ID: ${trade.id}`);
        console.log(`  Market: ${trade.market?.substring(0, 40)}...`);
        console.log(`  Side: ${trade.side} @ $${trade.price}`);
        console.log(`  Size: ${trade.size} shares`);
        console.log(`  Timestamp: ${new Date(Number(trade.match_time) * 1000).toISOString()}`);
      }
    } else {
      console.log('No trading history found');
    }
    console.log('='.repeat(70) + '\n');
  }, 30000);
});
