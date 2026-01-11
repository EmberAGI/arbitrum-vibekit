/**
 * Verify YES/NO token prices with detailed bid/ask (buy/sell) prices
 */

import { describe, it, expect } from 'vitest';
import { PolymarketAdapter } from '../src/polymarket-plugin/adapter.js';
import { ClobClient } from '@polymarket/clob-client';

const PRIVATE_KEY = process.env['POLYMARKET_PRIVATE_KEY'] || '0x0000000000000000000000000000000000000000000000000000000000000001';
const TEST_WALLET = '0x73b45E9DC72dC32Fb6b539d006e9Cb78830c18F5';

/**
 * Get order book data (bid/ask) for a token using CLOB client
 * Note: Currently the CLOB API doesn't seem to have a public order book endpoint.
 * This function attempts to use the CLOB client but may return null if unavailable.
 */
async function getOrderBook(
  tokenId: string,
  adapter: PolymarketAdapter,
  midPrice?: number,
): Promise<{
  bestBid: number | null; // Best price to sell (what buyers are offering)
  bestAsk: number | null; // Best price to buy (what sellers are asking)
  bidSize: number;
  askSize: number;
}> {
  try {
    // Try using CLOB client's methods
    try {
      const clob = await (adapter as any).getClobClient();

      // Check available methods - CLOB client might have getBook, getOrderbook, or similar
      if (clob) {
        // Try different method names
        const methods = ['getBook', 'getOrderbook', 'getOrderBook', 'book'];
        for (const methodName of methods) {
          if (typeof clob[methodName] === 'function') {
            try {
              const book = await clob[methodName](tokenId);
              if (book && (book.bids || book.asks)) {
                const bids = book.bids || [];
                const asks = book.asks || [];
                const bestBid = bids.length > 0 ? parseFloat(String(bids[0]!.price)) : null;
                const bestAsk = asks.length > 0 ? parseFloat(String(asks[0]!.price)) : null;
                const bidSize = bids.reduce((sum: number, b: any) => sum + parseFloat(String(b.size || 0)), 0);
                const askSize = asks.reduce((sum: number, a: any) => sum + parseFloat(String(a.size || 0)), 0);

                // Validate prices are reasonable
                // Prices should be between 0 and 1, bid <= ask, and if midPrice provided, should be close to it
                const isValid =
                  bestBid !== null && bestBid >= 0 && bestBid <= 1 &&
                  bestAsk !== null && bestAsk >= 0 && bestAsk <= 1 &&
                  bestBid <= bestAsk &&
                  (!midPrice || (Math.abs(bestBid - midPrice) < 0.5 && Math.abs(bestAsk - midPrice) < 0.5));

                if (isValid) {
                  return { bestBid, bestAsk, bidSize, askSize };
                }
              }
            } catch (e) {
              // Try next method
              continue;
            }
          }
        }
      }
    } catch (e) {
      // Fall through to API call
    }

    // Fallback: Try public API endpoint (may not work without auth)
    try {
      const response = await fetch(`https://clob.polymarket.com/book?token_id=${tokenId}`);
      if (response.ok) {
        const data = await response.json();

        // Check for error response
        if (data.error) {
          return { bestBid: null, bestAsk: null, bidSize: 0, askSize: 0 };
        }

        // Handle response format
        const bids = data.bids || data.data?.bids || data.orderbook?.bids || [];
        const asks = data.asks || data.data?.asks || data.orderbook?.asks || [];

        if (bids.length > 0 || asks.length > 0) {
          const bestBid = bids.length > 0 ? parseFloat(String(bids[0]!.price)) : null;
          const bestAsk = asks.length > 0 ? parseFloat(String(asks[0]!.price)) : null;
          const bidSize = bids.reduce((sum: number, b: any) => sum + parseFloat(String(b.size || 0)), 0);
          const askSize = asks.reduce((sum: number, a: any) => sum + parseFloat(String(a.size || 0)), 0);

          // Validate prices are reasonable
          const isValid =
            bestBid !== null && bestBid >= 0 && bestBid <= 1 &&
            bestAsk !== null && bestAsk >= 0 && bestAsk <= 1 &&
            bestBid <= bestAsk &&
            (!midPrice || (Math.abs(bestBid - midPrice) < 0.5 && Math.abs(bestAsk - midPrice) < 0.5));

          if (isValid) {
            return { bestBid, bestAsk, bidSize, askSize };
          }
        }
      }
    } catch (e) {
      // API call failed
    }

    // If we get here, order book data is not available
    return { bestBid: null, bestAsk: null, bidSize: 0, askSize: 0 };
  } catch (error) {
    // Silently fail - order book might not be available for all tokens
    return { bestBid: null, bestAsk: null, bidSize: 0, askSize: 0 };
  }
}

describe('Check Market Prices', () => {
  it('should fetch markets with YES/NO token prices', async () => {
    console.log('\n' + '='.repeat(70));
    console.log('💰 Checking YES/NO Token Prices');
    console.log('='.repeat(70) + '\n');

    const adapter = new PolymarketAdapter({
      chainId: 137,
      funderAddress: TEST_WALLET,
      privateKey: PRIVATE_KEY,
      signatureType: 0,
    });

    // Fetch markets 400-410 (offset 400, limit 10)
    console.log('📊 Fetching markets 400-410 (offset 400, limit 10)...\n');
    const result = await adapter.getMarkets({
      chainIds: ['137'],
      status: 'active',
      offset: 400,
      limit: 10
    });

    console.log(`Found ${result.markets.length} markets (markets 400-410)\n`);
    console.log('='.repeat(70));

    for (let i = 0; i < result.markets.length; i++) {
      const market = result.markets[i];
      if (!market) continue;

      console.log(`\n${'='.repeat(70)}`);
      console.log(`📊 MARKET #${400 + i}: ${market.title}`);
      console.log('='.repeat(70));

      // Basic Market Info
      console.log(`\n📋 BASIC INFORMATION:`);
      console.log(`   Market ID:        ${market.marketId}`);
      console.log(`   Chain ID:         ${market.chainId}`);
      console.log(`   Status:           ${market.status}`);
      console.log(`   End Date:         ${market.endTime || 'N/A'}`);
      console.log(`   Slug:             ${market.slug || 'N/A'}`);
      console.log(`   Image URL:        ${market.imageUrl || 'N/A'}`);
      console.log(`   Oracle:           ${market.oracle || 'N/A'}`);
      console.log(`   Resolution:       ${market.resolutionOutcome || 'Pending'}`);

      // Market Metrics
      console.log(`\n💰 MARKET METRICS:`);
      console.log(`   Volume:           $${parseFloat(market.volume || '0').toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      console.log(`   Liquidity:       $${parseFloat(market.liquidity || '0').toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      console.log(`   Tick Size:       ${market.tickSize || 'N/A'}`);
      console.log(`   Neg Risk:        ${market.negRisk ? 'Yes' : 'No'}`);
      console.log(`   Quote Token:     ${market.quoteTokenAddress || 'N/A'}`);

      // Display outcomes with all details
      console.log(`\n📈 OUTCOMES (${market.outcomes.length}):`);
      console.log('   ' + '='.repeat(70));

      const yesOutcome = market.outcomes.find(o => o.outcomeId === 'yes');
      const noOutcome = market.outcomes.find(o => o.outcomeId === 'no');

      for (const outcome of market.outcomes) {
        const midPrice = parseFloat(outcome.price || '0');
        const probability = (midPrice * 100).toFixed(1);

        // Fetch order book for this token
        if (outcome.tokenId) {
          const orderBook = await getOrderBook(outcome.tokenId, adapter, midPrice);

          console.log(`\n   🪙 ${outcome.name.toUpperCase()} Token:`);
          console.log(`      Outcome ID:    ${outcome.outcomeId}`);
          console.log(`      Name:          ${outcome.name}`);
          console.log(`      Token ID:      ${outcome.tokenId.substring(0, 50)}...`);
          console.log(`      Full Token ID: ${outcome.tokenId}`);
          console.log(`      Mid Price:     $${midPrice.toFixed(4)}`);
          console.log(`      Probability:   ${probability}%`);
          if (outcome.probability) {
            console.log(`      Probability:   ${outcome.probability}`);
          }

          // Note: Bid/Ask prices not available via API - only mid price from Gamma API
          console.log(`\n      ⚠️  Bid/Ask prices: Not available (CLOB order book API not accessible)`);
          console.log(`      ℹ️  Only mid-market price available from Gamma API`);
        }
      }

      // Summary for YES/NO
      if (yesOutcome && noOutcome) {
        const yesMid = parseFloat(yesOutcome.price || '0');
        const noMid = parseFloat(noOutcome.price || '0');
        const sum = yesMid + noMid;

        console.log(`\n   📋 PRICE SUMMARY:`);
        console.log(`   ${'-'.repeat(70)}`);
        console.log(`   YES Token:`);
        console.log(`      Token ID:   ${yesOutcome.tokenId || 'N/A'}`);
        console.log(`      Mid Price:  $${yesMid.toFixed(4)} (${(yesMid * 100).toFixed(2)}%)`);
        console.log(`   NO Token:`);
        console.log(`      Token ID:   ${noOutcome.tokenId || 'N/A'}`);
        console.log(`      Mid Price:   $${noMid.toFixed(4)} (${(noMid * 100).toFixed(2)}%)`);
        console.log(`\n   Price Validation: YES $${yesMid.toFixed(4)} + NO $${noMid.toFixed(4)} = $${sum.toFixed(4)}`);

        if (sum >= 0.95 && sum <= 1.05) {
          console.log(`   ✅ Price sum is correct!`);
        } else {
          console.log(`   ⚠️  Price sum is unusual (${sum.toFixed(4)})`);
        }
      }

      console.log('\n' + '='.repeat(70));
    }

    // Search for Trump Greenland market
    console.log('\n' + '='.repeat(70));
    console.log('🌍 Searching for "Will Trump acquire Greenland before 2027?" Market');
    console.log('='.repeat(70) + '\n');

    // Try multiple search queries to find the market
    const searchQueries = [
      'Trump acquire Greenland',
      'Greenland',
      'Trump Greenland',
      'acquire Greenland',
    ];

    let targetMarket = null;
    let searchResult = { markets: [] };

    for (const query of searchQueries) {
      console.log(`   Searching: "${query}"...`);
      // Try both active and resolved markets
      for (const status of ['active', 'resolved', undefined] as const) {
        searchResult = await adapter.getMarkets({
          chainIds: ['137'],
          ...(status ? { status } : {}),
          searchQuery: query,
          limit: 100
        });

        targetMarket = searchResult.markets.find(m => {
          const title = m.title.toLowerCase();
          // Match if it has both "trump" and "greenland"
          return (
            title.includes('trump') &&
            title.includes('greenland')
          );
        });

        if (targetMarket) {
          console.log(`   ✅ Found with query: "${query}" (status: ${status || 'all'})\n`);
          break;
        }
      }
      if (targetMarket) break;
    }

    if (targetMarket) {
      console.log(`✅ Found: ${targetMarket.title}`);
      console.log(`   Market ID: ${targetMarket.marketId}`);
      console.log(`   Status: ${targetMarket.status}`);
      console.log(`   End Date: ${targetMarket.endTime || 'N/A'}`);
      console.log(`   Volume: $${targetMarket.volume || '0'}`);
      console.log(`   Liquidity: $${targetMarket.liquidity || '0'}`);

      const yesOutcome = targetMarket.outcomes.find(o => o.outcomeId === 'yes');
      const noOutcome = targetMarket.outcomes.find(o => o.outcomeId === 'no');

      console.log('\n   📈 PRICES:');
      console.log('   ' + '='.repeat(70));

      if (yesOutcome && yesOutcome.tokenId) {
        const yesBook = await getOrderBook(yesOutcome.tokenId);
        const yesMid = parseFloat(yesOutcome.price || '0');

        console.log(`\n   🪙 YES Token:`);
        console.log(`      Mid Price: $${yesMid.toFixed(4)} (${(yesMid * 100).toFixed(1)}%)`);
        if (yesBook.bestBid !== null && yesBook.bestAsk !== null) {
          console.log(`      💵 Buy YES:  $${yesBook.bestAsk.toFixed(4)}  (${yesBook.askSize.toFixed(0)} shares)`);
          console.log(`      💵 Sell YES: $${yesBook.bestBid.toFixed(4)}  (${yesBook.bidSize.toFixed(0)} shares)`);
        } else {
          console.log(`      ⚠️  No order book data`);
        }
      }

      if (noOutcome && noOutcome.tokenId) {
        const noBook = await getOrderBook(noOutcome.tokenId);
        const noMid = parseFloat(noOutcome.price || '0');

        console.log(`\n   🪙 NO Token:`);
        console.log(`      Mid Price: $${noMid.toFixed(4)} (${(noMid * 100).toFixed(1)}%)`);
        if (noBook.bestBid !== null && noBook.bestAsk !== null) {
          console.log(`      💵 Buy NO:   $${noBook.bestAsk.toFixed(4)}  (${noBook.askSize.toFixed(0)} shares)`);
          console.log(`      💵 Sell NO:  $${noBook.bestBid.toFixed(4)}  (${noBook.bidSize.toFixed(0)} shares)`);
        } else {
          console.log(`      ⚠️  No order book data`);
        }
      }

      if (yesOutcome && noOutcome) {
        const yesMid = parseFloat(yesOutcome.price || '0');
        const noMid = parseFloat(noOutcome.price || '0');
        const sum = yesMid + noMid;
        console.log(`\n   📊 Summary: YES $${yesMid.toFixed(4)} + NO $${noMid.toFixed(4)} = $${sum.toFixed(4)}`);
      }

      console.log('\n' + '='.repeat(70));
    } else {
      console.log('❌ "Will Trump acquire Greenland before 2027?" market not found in search results');
      console.log(`   Searched ${searchResult.markets.length} markets`);
      if (searchResult.markets.length > 0) {
        console.log('   Sample of found markets:');
        searchResult.markets.slice(0, 10).forEach(m => {
          console.log(`     - ${m.title}`);
        });
        // Show any markets that contain "greenland" or "trump"
        const related = searchResult.markets.filter(m => {
          const title = m.title.toLowerCase();
          return title.includes('greenland') || title.includes('trump');
        });
        if (related.length > 0) {
          console.log(`\n   Related markets (${related.length}):`);
          related.forEach(m => {
            console.log(`     - ${m.title}`);
          });
        }
      }
      console.log('\n' + '='.repeat(70));
    }

    console.log('\n' + '='.repeat(70));
    console.log('📋 PRICE VERIFICATION COMPLETE');
    console.log('='.repeat(70) + '\n');

    expect(result.markets.length).toBeGreaterThan(0);

    // Verify structure
    const firstMarket = result.markets[0];
    expect(firstMarket).toHaveProperty('outcomes');
    expect(firstMarket?.outcomes.length).toBeGreaterThanOrEqual(2);

    const yesOutcome = firstMarket?.outcomes.find(o => o.outcomeId === 'yes');
    const noOutcome = firstMarket?.outcomes.find(o => o.outcomeId === 'no');

    expect(yesOutcome).toBeDefined();
    expect(noOutcome).toBeDefined();
    expect(yesOutcome?.price).toBeDefined();
    expect(noOutcome?.price).toBeDefined();

  }, 60000);

  it('should verify price data structure', async () => {
    console.log('\n📋 Verifying price data structure...\n');

    const adapter = new PolymarketAdapter({
      chainId: 137,
      funderAddress: TEST_WALLET,
      privateKey: PRIVATE_KEY,
      signatureType: 0,
    });

    const result = await adapter.getMarkets({
      chainIds: ['137'],
      status: 'active',
      limit: 1
    });

    if (result.markets.length === 0) {
      console.log('No markets found');
      return;
    }

    const market = result.markets[0]!;

    console.log('Market structure:');
    console.log(JSON.stringify({
      marketId: market.marketId,
      title: market.title.substring(0, 50) + '...',
      status: market.status,
      outcomes: market.outcomes.map(o => ({
        outcomeId: o.outcomeId,
        name: o.name,
        tokenId: o.tokenId ? o.tokenId.substring(0, 20) + '...' : null,
        price: o.price,
        probability: o.probability,
      })),
    }, null, 2));

    expect(market.outcomes[0]?.price).toBeDefined();
    expect(typeof market.outcomes[0]?.price).toBe('string');
  }, 30000);
});
