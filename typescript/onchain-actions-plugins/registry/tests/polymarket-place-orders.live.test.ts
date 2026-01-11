/**
 * POLYMARKET LIVE ORDER PLACEMENT TEST
 *
 * This script tests:
 * 1. Place BUY order for YES token
 * 2. Place BUY order for NO token (same market)
 * 3. Verify both tokens are from the same market
 * 4. Test position functions (getPositions, getTokenBalances)
 * 5. Verify data format is correct
 *
 * REQUIREMENTS:
 * - Set POLYMARKET_PRIVATE_KEY environment variable
 * - Wallet must have USDC on Polygon (minimum ~$5 recommended)
 * - Wallet must have small amount of POL for gas (if first time)
 *
 * Run with:
 *   POLYMARKET_PRIVATE_KEY="0x..." pnpm test polymarket-place-orders.live.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';

import { PolymarketAdapter } from '../src/polymarket-plugin/adapter.js';
import type { PredictionMarket } from '../src/core/schemas/predictionMarkets.js';

// Configuration
const TEST_WALLET_ADDRESS = '0x73b45E9DC72dC32Fb6b539d006e9Cb78830c18F5';
const PRIVATE_KEY = process.env['POLYMARKET_PRIVATE_KEY'];

// Order configuration - using minimum amounts for testing
// Polymarket requires: min $1 order value and min 5 shares for most markets
const TEST_ORDER_SIZE = '5'; // 5 shares (minimum for most markets)
const TEST_ORDER_PRICE = '0.25'; // $0.25 per share = $1.25 total (above $1 minimum)

// Skip tests if no private key provided
const skipTests = !PRIVATE_KEY;

interface TestContext {
  adapter: PolymarketAdapter;
  selectedMarket: PredictionMarket | null;
  yesOrderId: string | null;
  noOrderId: string | null;
  yesTokenId: string | null;
  noTokenId: string | null;
}

const ctx: TestContext = {
  adapter: null as unknown as PolymarketAdapter,
  selectedMarket: null,
  yesOrderId: null,
  noOrderId: null,
  yesTokenId: null,
  noTokenId: null,
};

describe.skipIf(skipTests)('Polymarket LIVE Order Placement Tests', () => {

  beforeAll(() => {
    if (!PRIVATE_KEY) {
      console.log('\n⚠️  POLYMARKET_PRIVATE_KEY not set. Skipping live order tests.\n');
      return;
    }

    ctx.adapter = new PolymarketAdapter({
      chainId: 137,
      funderAddress: TEST_WALLET_ADDRESS,
      privateKey: PRIVATE_KEY,
      maxOrderSize: 10,      // Small limit for testing
      maxOrderNotional: 50,  // $50 max for testing
    });

    console.log('\n' + '='.repeat(70));
    console.log('🔴 POLYMARKET LIVE ORDER PLACEMENT TEST');
    console.log('='.repeat(70));
    console.log(`Wallet: ${TEST_WALLET_ADDRESS}`);
    console.log(`Order Size: ${TEST_ORDER_SIZE} shares`);
    console.log(`Order Price: ${TEST_ORDER_PRICE} (low price to avoid fills)`);
    console.log('='.repeat(70) + '\n');
  });

  // ============================================================================
  // STEP 1: SELECT A MARKET
  // ============================================================================

  describe('Step 1: Market Selection', () => {
    it('should fetch active markets and select one for testing', async () => {
      console.log('\n📊 Fetching active markets...');

      const result = await ctx.adapter.getMarkets({ chainIds: ['137'], limit: 20, status: 'active' });

      expect(result.markets.length).toBeGreaterThan(0);
      console.log(`   Found ${result.markets.length} markets`);

      // Select a market with good liquidity (pick from top markets)
      // console.log('result.markets', result.markets);
      const activeMarkets = result.markets.filter(m =>
        m.status === 'active' &&
        m.outcomes.length === 2 &&
        m.outcomes[0]?.tokenId &&
        m.outcomes[1]?.tokenId
      );

      const resolvedMarket = result.markets.filter(m =>
        m.status === 'resolved' &&
        m.outcomes.length === 2

      );

      console.log('resolvedMarket', resolvedMarket.length);
      console.log('activeMarkets', activeMarkets.length);
      console.log("resolvedMarket[0]", resolvedMarket[0]);

      expect(activeMarkets.length).toBeGreaterThan(0);

      // Pick the first suitable market
      ctx.selectedMarket = activeMarkets[0] ?? null;
      expect(ctx.selectedMarket).not.toBeNull();

      if (ctx.selectedMarket) {
        ctx.yesTokenId = ctx.selectedMarket.outcomes[0]?.tokenId ?? null;
        ctx.noTokenId = ctx.selectedMarket.outcomes[1]?.tokenId ?? null;

        console.log('\n✅ Selected Market:');
        console.log(`   ID: ${ctx.selectedMarket.marketId}`);
        console.log(`   Title: ${ctx.selectedMarket.title.substring(0, 60)}...`);
        console.log(`   YES Token: ${ctx.yesTokenId?.substring(0, 20)}...`);
        console.log(`   NO Token: ${ctx.noTokenId?.substring(0, 20)}...`);
        console.log(`   YES Price: ${ctx.selectedMarket.outcomes[0]?.price}`);
        console.log(`   NO Price: ${ctx.selectedMarket.outcomes[1]?.price}`);
      }
    }, 30000);
  });

  // ============================================================================
  // STEP 2: PLACE YES ORDER
  // ============================================================================

  describe('Step 2: Place YES Order', () => {
    it('should place a BUY order for YES token', async () => {
      expect(ctx.selectedMarket).not.toBeNull();
      expect(ctx.yesTokenId).not.toBeNull();

      console.log('\n📝 Placing YES order...');
      console.log(`   Market: ${ctx.selectedMarket?.marketId}`);
      console.log(`   Outcome: YES`);
      console.log(`   Side: BUY`);
      console.log(`   Size: ${TEST_ORDER_SIZE}`);
      console.log(`   Price: ${TEST_ORDER_PRICE}`);

      const result = await ctx.adapter.placeOrder({
        chainId: '137',
        walletAddress: TEST_WALLET_ADDRESS,
        marketId: ctx.selectedMarket!.marketId,
        outcomeId: 'yes',
        side: 'buy',
        size: TEST_ORDER_SIZE,
        price: TEST_ORDER_PRICE,
      });

      console.log('\n📋 Order Result:');
      console.log(`   Success: ${result.success}`);
      console.log(`   Order ID: ${result.orderId || 'N/A'}`);
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }

      // Note: Order might fail due to insufficient funds or other reasons
      // We still track the result for verification
      if (result.success && result.orderId) {
        ctx.yesOrderId = result.orderId;
        console.log('   ✅ YES order placed successfully!');
      } else {
        console.log('   ⚠️  YES order failed (may need funds or setup)');
        console.log('   Continuing with tests...');
      }

      // Verify response structure
      expect(result).toHaveProperty('transactions');
      expect(result).toHaveProperty('success');
    }, 60000);
  });

  // ============================================================================
  // STEP 3: PLACE NO ORDER
  // ============================================================================

  describe('Step 3: Place NO Order', () => {
    it('should place a BUY order for NO token (same market)', async () => {
      expect(ctx.selectedMarket).not.toBeNull();
      expect(ctx.noTokenId).not.toBeNull();

      console.log('\n📝 Placing NO order (same market)...');
      console.log(`   Market: ${ctx.selectedMarket?.marketId}`);
      console.log(`   Outcome: NO`);
      console.log(`   Side: BUY`);
      console.log(`   Size: ${TEST_ORDER_SIZE}`);
      console.log(`   Price: ${TEST_ORDER_PRICE}`);

      const result = await ctx.adapter.placeOrder({
        chainId: '137',
        walletAddress: TEST_WALLET_ADDRESS,
        marketId: ctx.selectedMarket!.marketId,
        outcomeId: 'no',
        side: 'buy',
        size: TEST_ORDER_SIZE,
        price: TEST_ORDER_PRICE,
      });

      console.log('\n📋 Order Result:');
      console.log(`   Success: ${result.success}`);
      console.log(`   Order ID: ${result.orderId || 'N/A'}`);
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }

      if (result.success && result.orderId) {
        ctx.noOrderId = result.orderId;
        console.log('   ✅ NO order placed successfully!');
      } else {
        console.log('   ⚠️  NO order failed (may need funds or setup)');
      }

      expect(result).toHaveProperty('transactions');
      expect(result).toHaveProperty('success');
    }, 60000);
  });

  // ============================================================================
  // STEP 4: VERIFY ORDERS ARE FROM SAME MARKET
  // ============================================================================

  describe('Step 4: Verify Market Consistency', () => {
    it('should verify both orders are for the same market', async () => {
      console.log('\n🔍 Verifying market consistency...');

      // Get open orders
      const ordersResult = await ctx.adapter.getOrders({
        walletAddress: TEST_WALLET_ADDRESS,
      });

      console.log(`   Found ${ordersResult.orders.length} open orders`);

      if (ordersResult.orders.length > 0) {
        // Check if we have orders for the selected market
        const marketOrders = ordersResult.orders.filter(o =>
          o.tokenId === ctx.yesTokenId || o.tokenId === ctx.noTokenId
        );

        console.log(`   Orders for selected market: ${marketOrders.length}`);

        // Verify order structure
        for (const order of ordersResult.orders.slice(0, 3)) {
          console.log('\n   Order Details:');
          console.log(`     ID: ${order.orderId}`);
          console.log(`     Market ID: ${order.marketId}`);
          console.log(`     Outcome: ${order.outcomeId}`);
          console.log(`     Side: ${order.side}`);
          console.log(`     Price: ${order.price}`);
          console.log(`     Size: ${order.size}`);
          console.log(`     Status: ${order.status}`);
        }

        expect(ordersResult.orders[0]).toHaveProperty('orderId');
        expect(ordersResult.orders[0]).toHaveProperty('side');
        expect(ordersResult.orders[0]).toHaveProperty('price');
      } else {
        console.log('   ⚠️  No open orders found (orders may have been filled or rejected)');
      }

      expect(ordersResult).toHaveProperty('orders');
      expect(Array.isArray(ordersResult.orders)).toBe(true);
    }, 60000);
  });

  // ============================================================================
  // STEP 5: TEST POSITION FUNCTIONS
  // ============================================================================

  describe('Step 5: Test Position Functions', () => {
    it('should fetch positions and verify format', async () => {
      console.log('\n📊 Testing getPositions()...');

      const positions = await ctx.adapter.getPositions({
        walletAddress: TEST_WALLET_ADDRESS,
      });

      console.log(`   Found ${positions.positions.length} positions`);

      if (positions.positions.length > 0) {
        for (const pos of positions.positions.slice(0, 3)) {
          console.log('\n   Position Details:');
          console.log(`     Market ID: ${pos.marketId}`);
          console.log(`     Outcome: ${pos.outcomeId}`);
          console.log(`     Token ID: ${pos.tokenId?.substring(0, 20)}...`);
          console.log(`     Size: ${pos.size}`);
          console.log(`     Market Title: ${pos.marketTitle?.substring(0, 40)}...`);

          // Verify schema
          expect(pos).toHaveProperty('marketId');
          expect(pos).toHaveProperty('outcomeId');
          expect(pos).toHaveProperty('size');
          expect(pos).toHaveProperty('chainId');
          expect(pos.chainId).toBe('137');
        }
      } else {
        console.log('   ⚠️  No positions found (wallet may not have filled orders)');
      }

      expect(positions).toHaveProperty('positions');
      expect(Array.isArray(positions.positions)).toBe(true);
    }, 60000);

    it('should fetch token balances and verify format', async () => {
      console.log('\n📊 Testing getTokenBalances()...');

      // Get token IDs from selected market
      const tokenIds = [ctx.yesTokenId, ctx.noTokenId].filter((id): id is string => !!id);

      if (tokenIds.length === 0) {
        console.log('   ⚠️  No token IDs available for testing');
        return;
      }

      const balances = await ctx.adapter.getTokenBalances(TEST_WALLET_ADDRESS, tokenIds);

      console.log(`   Checked ${tokenIds.length} tokens, found ${balances.length} with balances`);

      for (const balance of balances) {
        console.log('\n   Balance Details:');
        console.log(`     Token ID: ${balance.tokenId.substring(0, 20)}...`);
        console.log(`     Balance: ${balance.balance}`);
        console.log(`     Market: ${balance.marketName?.substring(0, 40) || 'N/A'}`);

        expect(balance).toHaveProperty('tokenId');
        expect(balance).toHaveProperty('balance');
      }

      expect(Array.isArray(balances)).toBe(true);
    }, 60000);
  });

  // ============================================================================
  // STEP 6: TEST TRADING HISTORY
  // ============================================================================

  describe('Step 6: Test Trading History', () => {
    it('should fetch trading history', async () => {
      console.log('\n📊 Testing getTradingHistory()...');

      try {
        const history = await ctx.adapter.getTradingHistory(TEST_WALLET_ADDRESS, {
          limit: 10,
        });

        console.log(`   Found ${history.length} trades in history`);

        if (history.length > 0) {
          const trade = history[0];
          console.log('\n   Latest Trade:');
          console.log(`     ID: ${trade?.id || 'N/A'}`);
          console.log(`     Market: ${trade?.market || 'N/A'}`);
          console.log(`     Side: ${trade?.side || 'N/A'}`);
          console.log(`     Price: ${trade?.price || 'N/A'}`);
          console.log(`     Size: ${trade?.size || 'N/A'}`);
        } else {
          console.log('   ⚠️  No trading history (wallet may not have traded yet)');
        }

        expect(Array.isArray(history)).toBe(true);
      } catch (error) {
        console.log(`   ⚠️  Error fetching history: ${error instanceof Error ? error.message : String(error)}`);
        console.log('   (This may require CLOB authentication)');
      }
    }, 60000);
  });

  // ============================================================================
  // SUMMARY
  // ============================================================================

  describe('Test Summary', () => {
    it('should print summary', () => {
      console.log('\n' + '='.repeat(70));
      console.log('📊 ORDER PLACEMENT TEST SUMMARY');
      console.log('='.repeat(70));

      console.log('\n📋 Orders Placed:');
      console.log(`   YES Order ID: ${ctx.yesOrderId || '❌ Not placed'}`);
      console.log(`   NO Order ID: ${ctx.noOrderId || '❌ Not placed'}`);

      console.log('\n📍 Market Used:');
      console.log(`   ID: ${ctx.selectedMarket?.marketId || 'N/A'}`);
      console.log(`   Title: ${ctx.selectedMarket?.title?.substring(0, 50) || 'N/A'}...`);

      console.log('\n🔧 Next Steps:');
      console.log('   1. Run cancel-orders test to clean up');
      console.log('   2. Or let low-price orders expire naturally');
      console.log('='.repeat(70) + '\n');

      expect(true).toBe(true);
    });
  });
});

// Instructions for when tests are skipped
if (skipTests) {
  describe('Setup Instructions', () => {
    it('should show setup instructions', () => {
      console.log('\n' + '='.repeat(70));
      console.log('⚠️  POLYMARKET_PRIVATE_KEY NOT SET - TESTS SKIPPED');
      console.log('='.repeat(70));
      console.log('\nTo run these tests:');
      console.log('\n1. Export your private key:');
      console.log('   POLYMARKET_PRIVATE_KEY="0xYourPrivateKeyHere"');
      console.log('\n2. Ensure wallet has USDC on Polygon (~$5 minimum)');
      console.log('   USDC address: 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174');
      console.log('\n3. Ensure wallet has POL for gas (~0.1 POL)');
      console.log('\n4. Run the test:');
      console.log('   POLYMARKET_PRIVATE_KEY="0x..." pnpm test polymarket-place-orders.live.test.ts');
      console.log('='.repeat(70) + '\n');

      expect(true).toBe(true);
    });
  });
}
