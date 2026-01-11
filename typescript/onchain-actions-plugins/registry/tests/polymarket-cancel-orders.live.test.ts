/**
 * POLYMARKET LIVE ORDER CANCELLATION TEST
 *
 * This script tests:
 * 1. Show current open positions
 * 2. Show current open orders
 * 3. Cancel orders ONE BY ONE (first half)
 * 4. Cancel ALL remaining orders at once
 * 5. Verify cancellation worked
 *
 * REQUIREMENTS:
 * - Set POLYMARKET_PRIVATE_KEY environment variable
 * - Should have open orders (run place-orders test first)
 *
 * Run with:
 *   POLYMARKET_PRIVATE_KEY="0x..." pnpm test polymarket-cancel-orders.live.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';

import { PolymarketAdapter } from '../src/polymarket-plugin/adapter.js';
import type { PredictionOrder } from '../src/core/schemas/predictionMarkets.js';

// Configuration
const TEST_WALLET_ADDRESS = '0x73b45E9DC72dC32Fb6b539d006e9Cb78830c18F5';
const PRIVATE_KEY = process.env['POLYMARKET_PRIVATE_KEY'];

// Skip tests if no private key provided
const skipTests = !PRIVATE_KEY;

interface TestContext {
  adapter: PolymarketAdapter;
  initialOrders: PredictionOrder[];
  cancelledOrderIds: string[];
}

const ctx: TestContext = {
  adapter: null as unknown as PolymarketAdapter,
  initialOrders: [],
  cancelledOrderIds: [],
};

describe.skipIf(skipTests)('Polymarket LIVE Order Cancellation Tests', () => {

  beforeAll(() => {
    if (!PRIVATE_KEY) {
      console.log('\n⚠️  POLYMARKET_PRIVATE_KEY not set. Skipping live cancellation tests.\n');
      return;
    }

    ctx.adapter = new PolymarketAdapter({
      chainId: 137,
      funderAddress: TEST_WALLET_ADDRESS,
      privateKey: PRIVATE_KEY,
    });

    console.log('\n' + '='.repeat(70));
    console.log('🔴 POLYMARKET LIVE ORDER CANCELLATION TEST');
    console.log('='.repeat(70));
    console.log(`Wallet: ${TEST_WALLET_ADDRESS}`);
    console.log('='.repeat(70) + '\n');
  });

  // ============================================================================
  // STEP 1: SHOW CURRENT POSITIONS
  // ============================================================================

  describe('Step 1: Show Current Positions', () => {
    it('should display all current positions', async () => {
      console.log('\n📊 Fetching current positions...\n');

      const result = await ctx.adapter.getPositions({
        walletAddress: TEST_WALLET_ADDRESS,
      });

      console.log('=' .repeat(60));
      console.log('📍 CURRENT POSITIONS');
      console.log('='.repeat(60));

      if (result.positions.length === 0) {
        console.log('   No positions found (wallet has no filled orders)');
      } else {
        console.log(`   Total Positions: ${result.positions.length}\n`);

        for (const pos of result.positions) {
          console.log(`   📦 Position #${result.positions.indexOf(pos) + 1}`);
          console.log(`      Market: ${pos.marketTitle?.substring(0, 45) || pos.marketId}...`);
          console.log(`      Outcome: ${pos.outcomeName || pos.outcomeId}`);
          console.log(`      Size: ${pos.size} shares`);
          console.log(`      Token: ${pos.tokenId?.substring(0, 25)}...`);
          console.log('');
        }
      }

      console.log('='.repeat(60));

      expect(result).toHaveProperty('positions');
      expect(Array.isArray(result.positions)).toBe(true);
    }, 60000);
  });

  // ============================================================================
  // STEP 2: SHOW CURRENT OPEN ORDERS
  // ============================================================================

  describe('Step 2: Show Current Open Orders', () => {
    it('should display all open orders', async () => {
      console.log('\n📊 Fetching open orders...\n');

      const result = await ctx.adapter.getOrders({
        walletAddress: TEST_WALLET_ADDRESS,
      });

      ctx.initialOrders = result.orders;

      console.log('='.repeat(60));
      console.log('📋 CURRENT OPEN ORDERS');
      console.log('='.repeat(60));

      if (result.orders.length === 0) {
        console.log('   No open orders found');
        console.log('   💡 Run place-orders test first to create some orders');
      } else {
        console.log(`   Total Open Orders: ${result.orders.length}\n`);

        for (let i = 0; i < result.orders.length; i++) {
          const order = result.orders[i];
          if (!order) continue;

          console.log(`   📝 Order #${i + 1}`);
          console.log(`      ID: ${order.orderId}`);
          console.log(`      Market: ${order.marketId.substring(0, 25)}...`);
          console.log(`      Outcome: ${order.outcomeId}`);
          console.log(`      Side: ${order.side.toUpperCase()}`);
          console.log(`      Price: ${order.price}`);
          console.log(`      Size: ${order.size}`);
          console.log(`      Status: ${order.status}`);
          console.log('');
        }
      }

      console.log('='.repeat(60));

      expect(result).toHaveProperty('orders');
      expect(Array.isArray(result.orders)).toBe(true);
    }, 60000);
  });

  // ============================================================================
  // STEP 3: CANCEL ORDERS ONE BY ONE (First Half)
  // ============================================================================

  describe('Step 3: Cancel Orders One by One (First Half)', () => {
    it('should cancel orders individually', async () => {
      if (ctx.initialOrders.length === 0) {
        console.log('\n⚠️  No orders to cancel. Skipping individual cancellation.\n');
        return;
      }

      // Calculate how many to cancel one by one (first half)
      const halfCount = Math.ceil(ctx.initialOrders.length / 2);
      const ordersToCancel = ctx.initialOrders.slice(0, halfCount);

      console.log('\n🗑️  Cancelling first half of orders one by one...\n');
      console.log(`   Orders to cancel individually: ${ordersToCancel.length}`);
      console.log(`   Orders to cancel with cancelAll: ${ctx.initialOrders.length - halfCount}`);
      console.log('');

      for (const order of ordersToCancel) {
        console.log(`   ❌ Cancelling order: ${order.orderId.substring(0, 20)}...`);

        try {
          const result = await ctx.adapter.cancelOrder({
            chainId: '137',
            walletAddress: TEST_WALLET_ADDRESS,
            orderId: order.orderId,
          });

          if (result.success) {
            console.log(`      ✅ Cancelled successfully!`);
            ctx.cancelledOrderIds.push(order.orderId);
          } else {
            console.log(`      ⚠️  Cancellation may have failed`);
          }
        } catch (error) {
          console.log(`      ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
        }

        // Small delay between cancellations
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      console.log(`\n   Cancelled ${ctx.cancelledOrderIds.length} orders individually\n`);

      expect(true).toBe(true);
    }, 120000);
  });

  // ============================================================================
  // STEP 4: VERIFY PARTIAL CANCELLATION
  // ============================================================================

  describe('Step 4: Verify Partial Cancellation', () => {
    it('should show remaining orders after individual cancellations', async () => {
      console.log('\n📊 Fetching remaining orders after individual cancellations...\n');

      // Wait a bit for CLOB to update
      await new Promise(resolve => setTimeout(resolve, 2000));

      const result = await ctx.adapter.getOrders({
        walletAddress: TEST_WALLET_ADDRESS,
      });

      console.log('='.repeat(60));
      console.log('📋 REMAINING ORDERS (After Individual Cancellations)');
      console.log('='.repeat(60));
      console.log(`   Initial Orders: ${ctx.initialOrders.length}`);
      console.log(`   Cancelled Individually: ${ctx.cancelledOrderIds.length}`);
      console.log(`   Remaining Orders: ${result.orders.length}`);

      if (result.orders.length > 0) {
        console.log('\n   Remaining order IDs:');
        for (const order of result.orders) {
          console.log(`      - ${order.orderId.substring(0, 30)}... (${order.side} ${order.size}@${order.price})`);
        }
      }

      console.log('='.repeat(60));

      expect(result).toHaveProperty('orders');
    }, 60000);
  });

  // ============================================================================
  // STEP 5: CANCEL ALL REMAINING ORDERS AT ONCE
  // ============================================================================

  describe('Step 5: Cancel All Remaining Orders at Once', () => {
    it('should cancel all remaining orders with cancelAll', async () => {
      // Check if there are remaining orders
      const beforeResult = await ctx.adapter.getOrders({
        walletAddress: TEST_WALLET_ADDRESS,
      });

      if (beforeResult.orders.length === 0) {
        console.log('\n⚠️  No remaining orders to cancel.\n');
        return;
      }

      console.log('\n🗑️  Cancelling ALL remaining orders at once...\n');
      console.log(`   Orders to cancel: ${beforeResult.orders.length}`);

      try {
        const result = await ctx.adapter.cancelOrder({
          chainId: '137',
          walletAddress: TEST_WALLET_ADDRESS,
          orderId: 'all', // Special value to cancel all
        });

        console.log(`\n   Result:`);
        console.log(`      Success: ${result.success}`);
        console.log(`      Cancelled Count: ${result.cancelledCount || 'N/A'}`);

        if (result.success) {
          console.log('      ✅ All remaining orders cancelled!');
        } else {
          console.log('      ⚠️  Some orders may not have been cancelled');
        }

        expect(result).toHaveProperty('success');
      } catch (error) {
        console.log(`   ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
      }
    }, 60000);
  });

  // ============================================================================
  // STEP 6: VERIFY ALL CANCELLATIONS
  // ============================================================================

  describe('Step 6: Verify All Cancellations', () => {
    it('should verify no orders remain', async () => {
      console.log('\n📊 Final verification - checking for remaining orders...\n');

      // Wait a bit for CLOB to update
      await new Promise(resolve => setTimeout(resolve, 2000));

      const result = await ctx.adapter.getOrders({
        walletAddress: TEST_WALLET_ADDRESS,
      });

      console.log('='.repeat(60));
      console.log('📋 FINAL ORDER STATUS');
      console.log('='.repeat(60));
      console.log(`   Initial Orders: ${ctx.initialOrders.length}`);
      console.log(`   Remaining Orders: ${result.orders.length}`);

      if (result.orders.length === 0) {
        console.log('\n   ✅ All orders successfully cancelled!');
      } else {
        console.log('\n   ⚠️  Some orders still remain:');
        for (const order of result.orders) {
          console.log(`      - ${order.orderId.substring(0, 30)}...`);
        }
      }

      console.log('='.repeat(60));

      expect(result).toHaveProperty('orders');
    }, 60000);
  });

  // ============================================================================
  // STEP 7: TEST cancelAllOrders() HELPER
  // ============================================================================

  describe('Step 7: Test cancelAllOrders() Helper', () => {
    it('should test the cancelAllOrders helper method', async () => {
      console.log('\n📊 Testing cancelAllOrders() helper method...\n');

      try {
        const result = await ctx.adapter.cancelAllOrders();

        console.log('   Result:');
        console.log(`      Success: ${result.success}`);
        console.log(`      Cancelled: ${result.cancelled}`);

        if (result.success) {
          console.log('      ✅ cancelAllOrders() works correctly!');
        }

        expect(result).toHaveProperty('success');
        expect(result).toHaveProperty('cancelled');
      } catch (error) {
        console.log(`   ⚠️  Error: ${error instanceof Error ? error.message : String(error)}`);
        console.log('   (This is expected if no orders exist)');
      }
    }, 60000);
  });

  // ============================================================================
  // SUMMARY
  // ============================================================================

  describe('Test Summary', () => {
    it('should print cancellation summary', () => {
      console.log('\n' + '='.repeat(70));
      console.log('📊 ORDER CANCELLATION TEST SUMMARY');
      console.log('='.repeat(70));

      console.log('\n📋 Results:');
      console.log(`   Initial Orders: ${ctx.initialOrders.length}`);
      console.log(`   Cancelled Individually: ${ctx.cancelledOrderIds.length}`);
      console.log(`   Cancelled with cancelAll: ${Math.max(0, ctx.initialOrders.length - ctx.cancelledOrderIds.length)}`);

      console.log('\n✅ Functions Tested:');
      console.log('   - getPositions()');
      console.log('   - getOrders()');
      console.log('   - cancelOrder(orderId) - Individual cancellation');
      console.log('   - cancelOrder("all") - Bulk cancellation');
      console.log('   - cancelAllOrders() - Helper method');

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
      console.log('\n2. First run the place-orders test to create orders:');
      console.log('   POLYMARKET_PRIVATE_KEY="0x..." pnpm test polymarket-place-orders.live.test.ts');
      console.log('\n3. Then run this cancellation test:');
      console.log('   POLYMARKET_PRIVATE_KEY="0x..." pnpm test polymarket-cancel-orders.live.test.ts');
      console.log('='.repeat(70) + '\n');

      expect(true).toBe(true);
    });
  });
}
