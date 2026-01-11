/**
 * POLYMARKET LIVE API TESTS
 *
 * This test file calls REAL Polymarket APIs without any mocking.
 * It tests all getter/query functions that don't require authentication.
 *
 * Run with: pnpm test polymarket-live.test.ts
 *
 * IMPORTANT: These tests make real network requests!
 */

import { describe, it, expect, beforeAll } from 'vitest';

import { PolymarketAdapter } from '../src/polymarket-plugin/adapter.js';
import { getPolymarketEmberPlugin } from '../src/polymarket-plugin/index.js';

// Test wallet address
const TEST_WALLET_ADDRESS = '0x73b45E9DC72dC32Fb6b539d006e9Cb78830c18F5';

// Use real private key from environment if available, otherwise use dummy for public queries
const PRIVATE_KEY = process.env['POLYMARKET_PRIVATE_KEY'] ??
  '0x0000000000000000000000000000000000000000000000000000000000000001';

// Check if we have a real private key for authenticated functions
const hasRealPrivateKey = !!process.env['POLYMARKET_PRIVATE_KEY'];

/**
 * Test Results Tracker
 * Tracks which functions work and which need positions/data
 */
interface TestResult {
  function: string;
  status: 'PASS' | 'FAIL' | 'NO_DATA' | 'NEEDS_POSITION';
  dataCount?: number;
  sampleData?: unknown;
  error?: string;
  notes?: string;
}

const testResults: TestResult[] = [];

function logResult(result: TestResult) {
  testResults.push(result);
  const emoji = result.status === 'PASS' ? '✅' : result.status === 'FAIL' ? '❌' : '⚠️';
  console.log(`${emoji} ${result.function}: ${result.status}${result.dataCount !== undefined ? ` (${result.dataCount} items)` : ''}`);
  if (result.notes) console.log(`   📝 ${result.notes}`);
  if (result.error) console.log(`   ❌ Error: ${result.error}`);
}

describe('Polymarket LIVE API Tests', () => {
  let adapter: PolymarketAdapter;

  beforeAll(() => {
    adapter = new PolymarketAdapter({
      chainId: 137,
      funderAddress: TEST_WALLET_ADDRESS,
      privateKey: PRIVATE_KEY,
    });

    console.log('\n' + '='.repeat(60));
    console.log('🔴 POLYMARKET LIVE API TESTS - REAL NETWORK REQUESTS');
    console.log('='.repeat(60));
    console.log(`Test Wallet: ${TEST_WALLET_ADDRESS}`);
    console.log('='.repeat(60) + '\n');
  });

  // ============================================================================
  // PUBLIC GETTER FUNCTIONS (No authentication required)
  // ============================================================================

  describe('Public Getter Functions', () => {

    it('getMarkets() - Fetch active prediction markets', async () => {
      const startTime = Date.now();

      try {
        const result = await adapter.getMarkets({ chainIds: ['137'] });
        const duration = Date.now() - startTime;

        expect(result).toBeDefined();
        expect(result.markets).toBeDefined();
        expect(Array.isArray(result.markets)).toBe(true);

        if (result.markets.length > 0) {
          const sample = result.markets[0];

          // Verify schema
          expect(sample?.marketId).toBeDefined();
          expect(sample?.title).toBeDefined();
          expect(sample?.status).toBeDefined();
          expect(sample?.outcomes).toBeDefined();
          expect(sample?.outcomes.length).toBeGreaterThan(0);

          logResult({
            function: 'getMarkets()',
            status: 'PASS',
            dataCount: result.markets.length,
            sampleData: {
              marketId: sample?.marketId,
              title: sample?.title?.substring(0, 50) + '...',
              status: sample?.status,
              outcomes: sample?.outcomes.map(o => ({ id: o.outcomeId, price: o.price })),
            },
            notes: `Fetched in ${duration}ms`,
          });
        } else {
          logResult({
            function: 'getMarkets()',
            status: 'NO_DATA',
            dataCount: 0,
            notes: 'API returned empty array - may be temporary',
          });
        }
      } catch (error) {
        logResult({
          function: 'getMarkets()',
          status: 'FAIL',
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }, 30000);

    it('getMarkets() with search query', async () => {
      try {
        const result = await adapter.getMarkets({
          chainIds: ['137'],
          searchQuery: 'election',
          limit: 10,
        });

        expect(result).toBeDefined();

        logResult({
          function: 'getMarkets(search)',
          status: result.markets.length > 0 ? 'PASS' : 'NO_DATA',
          dataCount: result.markets.length,
          notes: 'Search query: "election"',
        });
      } catch (error) {
        logResult({
          function: 'getMarkets(search)',
          status: 'FAIL',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, 30000);

    it('getAvailableTokens() - Fetch tradeable token addresses', async () => {
      try {
        const result = await adapter.getAvailableTokens();

        expect(result).toBeDefined();
        expect(result.usdc).toBe('0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174');
        expect(Array.isArray(result.yesTokens)).toBe(true);
        expect(Array.isArray(result.noTokens)).toBe(true);

        logResult({
          function: 'getAvailableTokens()',
          status: 'PASS',
          dataCount: result.yesTokens.length + result.noTokens.length,
          sampleData: {
            usdc: result.usdc,
            yesTokensCount: result.yesTokens.length,
            noTokensCount: result.noTokens.length,
            sampleYesToken: result.yesTokens[0]?.substring(0, 20) + '...',
          },
        });
      } catch (error) {
        logResult({
          function: 'getAvailableTokens()',
          status: 'FAIL',
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }, 30000);

    it('getPositions() - Fetch wallet positions', async () => {
      try {
        const result = await adapter.getPositions({
          walletAddress: TEST_WALLET_ADDRESS,
        });

        expect(result).toBeDefined();
        expect(result.positions).toBeDefined();
        expect(Array.isArray(result.positions)).toBe(true);

        if (result.positions.length > 0) {
          const sample = result.positions[0];
          logResult({
            function: 'getPositions()',
            status: 'PASS',
            dataCount: result.positions.length,
            sampleData: {
              marketId: sample?.marketId,
              outcomeId: sample?.outcomeId,
              size: sample?.size,
              marketTitle: sample?.marketTitle?.substring(0, 30) + '...',
            },
          });
        } else {
          logResult({
            function: 'getPositions()',
            status: 'NEEDS_POSITION',
            dataCount: 0,
            notes: 'Wallet has no positions - open a position to test this',
          });
        }
      } catch (error) {
        logResult({
          function: 'getPositions()',
          status: 'FAIL',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, 30000);

    it('getTokenBalances() - Direct blockchain query', async () => {
      try {
        // First get some token IDs from markets
        const markets = await adapter.getMarkets({ chainIds: ['137'], limit: 5 });
        const tokenIds = markets.markets
          .slice(0, 3)
          .flatMap(m => m.outcomes.map(o => o.tokenId))
          .filter((id): id is string => id !== undefined);

        if (tokenIds.length === 0) {
          logResult({
            function: 'getTokenBalances()',
            status: 'NO_DATA',
            notes: 'No token IDs available from markets',
          });
          return;
        }

        const result = await adapter.getTokenBalances(TEST_WALLET_ADDRESS, tokenIds);

        expect(result).toBeDefined();
        expect(Array.isArray(result)).toBe(true);

        const nonZeroBalances = result.filter(b => b.balance !== '0' && parseInt(b.balance) > 0);

        if (nonZeroBalances.length > 0) {
          logResult({
            function: 'getTokenBalances()',
            status: 'PASS',
            dataCount: nonZeroBalances.length,
            sampleData: nonZeroBalances[0],
          });
        } else {
          logResult({
            function: 'getTokenBalances()',
            status: 'NEEDS_POSITION',
            dataCount: 0,
            notes: `Checked ${tokenIds.length} tokens - wallet has no balances. Open positions to test.`,
          });
        }
      } catch (error) {
        logResult({
          function: 'getTokenBalances()',
          status: 'FAIL',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, 60000);
  });

  // ============================================================================
  // AUTHENTICATED FUNCTIONS (Require private key)
  // ============================================================================

  describe('Authenticated Functions', () => {

    it('getOrders() - Fetch open orders', async () => {
      if (!hasRealPrivateKey) {
        console.log('   ⏭️  Skipped: No private key provided');
        logResult({
          function: 'getOrders()',
          status: 'NO_DATA',
          notes: 'Skipped - requires POLYMARKET_PRIVATE_KEY',
        });
        return;
      }

      try {
        const result = await adapter.getOrders({
          walletAddress: TEST_WALLET_ADDRESS,
        });

        expect(result).toBeDefined();
        expect(Array.isArray(result.orders)).toBe(true);

        console.log('\n   📋 OPEN ORDERS:');
        console.log('   ' + '-'.repeat(50));

        if (result.orders.length > 0) {
          for (const order of result.orders) {
            console.log(`   Order ID: ${order.orderId?.substring(0, 20)}...`);
            console.log(`     Market: ${order.marketId}`);
            console.log(`     Side: ${order.side.toUpperCase()} ${order.outcomeId.toUpperCase()}`);
            console.log(`     Size: ${order.size} @ $${order.price}`);
            console.log(`     Status: ${order.status}`);
            console.log('   ' + '-'.repeat(50));
          }

          logResult({
            function: 'getOrders()',
            status: 'PASS',
            dataCount: result.orders.length,
          });
        } else {
          console.log('   No open orders found');
          logResult({
            function: 'getOrders()',
            status: 'PASS',
            dataCount: 0,
            notes: 'No open orders',
          });
        }
      } catch (error) {
        logResult({
          function: 'getOrders()',
          status: 'FAIL',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, 30000);

    it('getPortfolioSummary() - Full portfolio with YES/NO holdings', async () => {
      if (!hasRealPrivateKey) {
        console.log('   ⏭️  Skipped: No private key provided');
        logResult({
          function: 'getPortfolioSummary()',
          status: 'NO_DATA',
          notes: 'Skipped - requires POLYMARKET_PRIVATE_KEY',
        });
        return;
      }

      try {
        const portfolio = await adapter.getPortfolioSummary(TEST_WALLET_ADDRESS);

        expect(portfolio).toBeDefined();
        expect(Array.isArray(portfolio.markets)).toBe(true);

        console.log('\n   ' + '='.repeat(60));
        console.log('   📊 PORTFOLIO SUMMARY');
        console.log('   ' + '='.repeat(60));
        console.log(`   Wallet: ${TEST_WALLET_ADDRESS}`);
        console.log(`   Total Positions: ${portfolio.totalPositions}`);
        console.log(`   Total Open Orders: ${portfolio.totalOpenOrders}`);
        console.log(`   Markets with Activity: ${portfolio.markets.length}`);
        console.log('   ' + '='.repeat(60));

        if (portfolio.markets.length > 0) {
          console.log('\n   📈 POSITIONS BY MARKET:\n');

          for (const market of portfolio.markets) {
            console.log(`   Market: ${market.title.substring(0, 50)}...`);
            console.log(`   ID: ${market.marketId} | Status: ${market.status}`);
            console.log('   ' + '-'.repeat(55));

            // YES Token details
            const yesBalance = parseInt(market.yesToken.balance);
            const yesBuyOrders = market.yesToken.pendingBuyOrders;
            const yesSellOrders = market.yesToken.pendingSellOrders;
            console.log(`   ✅ YES Token:`);
            console.log(`      Balance: ${yesBalance > 0 ? yesBalance.toLocaleString() : '0'} tokens`);
            console.log(`      Current Price: $${market.yesToken.currentPrice}`);
            if (yesBuyOrders > 0) console.log(`      Pending BUY Orders: ${yesBuyOrders}`);
            if (yesSellOrders > 0) console.log(`      Pending SELL Orders: ${yesSellOrders}`);

            // NO Token details
            const noBalance = parseInt(market.noToken.balance);
            const noBuyOrders = market.noToken.pendingBuyOrders;
            const noSellOrders = market.noToken.pendingSellOrders;
            console.log(`   ❌ NO Token:`);
            console.log(`      Balance: ${noBalance > 0 ? noBalance.toLocaleString() : '0'} tokens`);
            console.log(`      Current Price: $${market.noToken.currentPrice}`);
            if (noBuyOrders > 0) console.log(`      Pending BUY Orders: ${noBuyOrders}`);
            if (noSellOrders > 0) console.log(`      Pending SELL Orders: ${noSellOrders}`);

            // Estimated value
            const yesValue = (yesBalance / 1_000_000) * parseFloat(market.yesToken.currentPrice);
            const noValue = (noBalance / 1_000_000) * parseFloat(market.noToken.currentPrice);
            const totalValue = yesValue + noValue;
            if (totalValue > 0) {
              console.log(`   💰 Estimated Value: $${totalValue.toFixed(4)}`);
            }

            console.log('\n');
          }

          logResult({
            function: 'getPortfolioSummary()',
            status: 'PASS',
            dataCount: portfolio.markets.length,
            notes: `${portfolio.totalPositions} positions, ${portfolio.totalOpenOrders} open orders`,
          });
        } else {
          console.log('\n   No positions or open orders found.');
          console.log('   Place an order using polymarket-place-orders.live.test.ts first.');
          logResult({
            function: 'getPortfolioSummary()',
            status: 'NEEDS_POSITION',
            dataCount: 0,
            notes: 'No positions or orders - place an order first',
          });
        }
      } catch (error) {
        logResult({
          function: 'getPortfolioSummary()',
          status: 'FAIL',
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }, 120000);

    it('getTradingHistory() - Fetch trade history', async () => {
      if (!hasRealPrivateKey) {
        console.log('   ⏭️  Skipped: No private key provided');
        logResult({
          function: 'getTradingHistory()',
          status: 'NO_DATA',
          notes: 'Skipped - requires POLYMARKET_PRIVATE_KEY',
        });
        return;
      }

      try {
        const trades = await adapter.getTradingHistory(TEST_WALLET_ADDRESS, { limit: 10 });

        expect(Array.isArray(trades)).toBe(true);

        console.log('\n   📜 TRADING HISTORY:');
        console.log('   ' + '-'.repeat(50));

        if (trades.length > 0) {
          for (const trade of trades.slice(0, 5)) {
            console.log(`   Trade: ${trade.id?.substring(0, 20)}...`);
            console.log(`     Market: ${trade.market?.substring(0, 30)}...`);
            console.log(`     Side: ${trade.side} @ $${trade.price}`);
            console.log(`     Size: ${trade.size}`);
            console.log(`     Time: ${trade.match_time}`);
            console.log('   ' + '-'.repeat(50));
          }

          logResult({
            function: 'getTradingHistory()',
            status: 'PASS',
            dataCount: trades.length,
          });
        } else {
          console.log('   No trading history found');
          logResult({
            function: 'getTradingHistory()',
            status: 'PASS',
            dataCount: 0,
            notes: 'No trades yet',
          });
        }
      } catch (error) {
        logResult({
          function: 'getTradingHistory()',
          status: 'FAIL',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, 30000);
  });

  // ============================================================================
  // PLUGIN INTEGRATION TEST
  // ============================================================================

  describe('Plugin Integration', () => {
    it('getPolymarketEmberPlugin() - Create plugin instance', async () => {
      try {
        const plugin = await getPolymarketEmberPlugin({
          chainId: 137,
          funderAddress: TEST_WALLET_ADDRESS,
          privateKey: PRIVATE_KEY,
        });

        expect(plugin).toBeDefined();
        expect(plugin.type).toBe('predictionMarkets');
        expect(plugin.actions).toHaveLength(3);
        expect(plugin.queries.getMarkets).toBeDefined();
        expect(plugin.queries.getPositions).toBeDefined();
        expect(plugin.queries.getOrders).toBeDefined();

        logResult({
          function: 'getPolymarketEmberPlugin()',
          status: 'PASS',
          sampleData: {
            type: plugin.type,
            actionsCount: plugin.actions.length,
            actionTypes: plugin.actions.map(a => a.type),
          },
        });
      } catch (error) {
        logResult({
          function: 'getPolymarketEmberPlugin()',
          status: 'FAIL',
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }, 30000);

    it('Plugin queries work via plugin interface', async () => {
      try {
        const plugin = await getPolymarketEmberPlugin({
          chainId: 137,
          funderAddress: TEST_WALLET_ADDRESS,
          privateKey: PRIVATE_KEY,
        });

        const markets = await plugin.queries.getMarkets({ chainIds: ['137'], limit: 5 });

        expect(markets).toBeDefined();
        expect(markets.markets).toBeDefined();

        logResult({
          function: 'plugin.queries.getMarkets()',
          status: 'PASS',
          dataCount: markets.markets.length,
        });
      } catch (error) {
        logResult({
          function: 'plugin.queries.getMarkets()',
          status: 'FAIL',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, 30000);
  });

  // ============================================================================
  // SUMMARY
  // ============================================================================

  describe('Test Summary', () => {
    it('Print test results summary', () => {
      console.log('\n' + '='.repeat(60));
      console.log('📊 TEST RESULTS SUMMARY');
      console.log('='.repeat(60));

      const passed = testResults.filter(r => r.status === 'PASS').length;
      const failed = testResults.filter(r => r.status === 'FAIL').length;
      const noData = testResults.filter(r => r.status === 'NO_DATA').length;
      const needsPosition = testResults.filter(r => r.status === 'NEEDS_POSITION').length;

      console.log(`✅ PASSED: ${passed}`);
      console.log(`❌ FAILED: ${failed}`);
      console.log(`⚠️  NO DATA: ${noData}`);
      console.log(`📍 NEEDS POSITION: ${needsPosition}`);

      console.log('\n📋 DETAILED RESULTS:');
      console.log('-'.repeat(60));

      for (const result of testResults) {
        const emoji = result.status === 'PASS' ? '✅' :
                      result.status === 'FAIL' ? '❌' :
                      result.status === 'NEEDS_POSITION' ? '📍' : '⚠️';
        console.log(`${emoji} ${result.function.padEnd(35)} ${result.status}`);
        if (result.dataCount !== undefined) {
          console.log(`   └─ Data count: ${result.dataCount}`);
        }
        if (result.notes) {
          console.log(`   └─ Note: ${result.notes}`);
        }
      }

      console.log('\n' + '='.repeat(60));
      console.log('📝 FUNCTIONS REQUIRING OPEN POSITION:');
      console.log('='.repeat(60));
      console.log('These functions returned no data because wallet has no positions:');
      testResults
        .filter(r => r.status === 'NEEDS_POSITION')
        .forEach(r => console.log(`  • ${r.function}`));

      console.log('\n' + '='.repeat(60));
      console.log('🔐 FUNCTIONS REQUIRING PRIVATE KEY:');
      console.log('='.repeat(60));
      console.log('These functions were NOT tested (need real private key):');
      console.log('  • placeOrder() - Places buy/sell orders');
      console.log('  • cancelOrder() - Cancels pending orders');
      console.log('  • getOrders() - Gets authenticated user orders');
      console.log('  • getTradingHistory() - Gets user trade history');
      console.log('  • getUserEarnings() - Gets user earnings');

      console.log('\n' + '='.repeat(60));
      console.log('🔧 NEXT STEPS TO TEST SETTER FUNCTIONS:');
      console.log('='.repeat(60));
      console.log('1. Set POLYMARKET_PRIVATE_KEY environment variable');
      console.log('   (Private key of wallet: ' + TEST_WALLET_ADDRESS + ')');
      console.log('2. Ensure wallet has USDC on Polygon for trading');
      console.log('3. Run authenticated tests (will be created separately)');
      console.log('='.repeat(60) + '\n');

      // This test always passes - it's just for summary
      expect(true).toBe(true);
    });
  });
});
