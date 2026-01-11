/**
 * Check Polymarket positions and token balances
 */

import { describe, it } from 'vitest';
import { PolymarketAdapter } from '../src/polymarket-plugin/adapter.js';

const PRIVATE_KEY = process.env['POLYMARKET_PRIVATE_KEY'];
const WALLET = '0x73b45E9DC72dC32Fb6b539d006e9Cb78830c18F5';

describe('Check Polymarket Balances', () => {
  it('should show all positions and token balances > 0', async () => {
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
    console.log('📊 Checking Polymarket Positions & Token Balances');
    console.log('='.repeat(60));
    console.log('Wallet:', WALLET);
    console.log('');

    // Get positions via API
    console.log('📍 Positions from getPositions():');
    try {
      const positions = await adapter.getPositions({
        walletAddress: WALLET,
        chainIds: ['137'],
      });
      if (positions.positions.length === 0) {
        console.log('   No positions found via API');
      } else {
        for (const pos of positions.positions) {
          console.log('');
          console.log('   Market:', pos.marketId);
          console.log('   Outcome:', pos.outcomeId, '| Size:', pos.size);
          console.log('   Value:', pos.currentValue);
        }
      }
    } catch (e) {
      console.log('   Error fetching positions:', (e as Error).message);
    }
    console.log('');

    // Get trading history first to find token IDs
    console.log('📜 Recent Trading History (to find token IDs):');
    let tokenIds: string[] = [];
    let history: Awaited<ReturnType<typeof adapter.getTradingHistory>> = [];
    try {
      history = await adapter.getTradingHistory(WALLET, { limit: 20 });
      if (history.length === 0) {
        console.log('   No trades found');
      } else {
        console.log(`   Found ${history.length} trades\n`);
        // Get unique token IDs from trades
        tokenIds = [...new Set(history.map((t) => t.asset_id).filter(Boolean))] as string[];
        console.log(`   Unique token IDs from trades: ${tokenIds.length}`);

        for (const trade of history.slice(0, 5)) {
          console.log('   ─────────────────────────────────────');
          console.log('   Trade ID:', trade.id);
          console.log('   Token ID:', trade.asset_id?.substring(0, 30) + '...');
          console.log('   Side:', trade.side, '| Outcome:', trade.outcome);
          console.log('   Size:', trade.size, '@ $' + trade.price);
        }
      }
    } catch (e) {
      console.log('   Error fetching history:', (e as Error).message);
    }
    console.log('');

    // Get token balances for traded tokens
    console.log('🪙 Token Balances (ERC-1155 Conditional Tokens):');
    if (tokenIds.length === 0) {
      console.log('   No token IDs to check (no trading history)');
    } else {
      try {
        const balances = await adapter.getTokenBalances(WALLET, tokenIds);
        const nonZero = balances.filter((b) => parseFloat(b.balance) > 0);

        if (nonZero.length === 0) {
          console.log('   No tokens with balance > 0');
          console.log('   (Orders may have been cancelled or filled+sold)');
        } else {
          console.log(`   Found ${nonZero.length} tokens with balance > 0:\n`);

          // Get market details by looking up each unique market (condition ID)
          console.log('   Fetching market names...\n');

          // Build a map of condition ID -> market details
          const marketDetailsMap = new Map<string, { title: string; slug?: string }>();
          const uniqueConditionIds = [...new Set(history.map((t) => t.market))];

          for (const conditionId of uniqueConditionIds) {
            try {
              // Fetch market by looking up via clob_token_ids (using the token from a trade)
              const tradeWithCondition = history.find((t) => t.market === conditionId);
              if (tradeWithCondition?.asset_id) {
                const url = `https://gamma-api.polymarket.com/markets?clob_token_ids=${tradeWithCondition.asset_id}`;
                const response = await fetch(url);
                if (response.ok) {
                  const data = (await response.json()) as Array<{ question: string; slug?: string }>;
                  if (data.length > 0 && data[0]) {
                    marketDetailsMap.set(conditionId, {
                      title: data[0].question,
                      slug: data[0].slug,
                    });
                  }
                }
              }
            } catch {
              // Ignore errors, will show condition ID instead
            }
          }

          // Get market details for each token
          for (const b of nonZero) {
            // Convert from 6 decimals (USDC-like) to human readable
            const rawBalance = parseFloat(b.balance);
            const humanBalance = rawBalance / 1_000_000;

            // Find matching trade for market info
            const basicTrade = history.find((t) => t.asset_id === b.tokenId);
            const marketDetails = basicTrade ? marketDetailsMap.get(basicTrade.market) : undefined;

            console.log('   ═══════════════════════════════════════════════════════');
            console.log('   📈 POSITION #' + (nonZero.indexOf(b) + 1));
            console.log('   ───────────────────────────────────────────────────────');
            if (marketDetails?.title) {
              console.log('   Market: ' + marketDetails.title);
              if (marketDetails.slug) {
                console.log('   URL: https://polymarket.com/event/' + marketDetails.slug);
              }
            } else {
              console.log('   Market ID:', basicTrade?.market?.substring(0, 30) + '...');
            }
            console.log('   Outcome: ' + (basicTrade?.outcome || 'Unknown'));
            console.log('   Balance: ' + humanBalance.toFixed(2) + ' shares');
            console.log('   Token ID: ' + b.tokenId.substring(0, 30) + '...');
          }

          // Summary
          const totalShares = nonZero.reduce(
            (sum, b) => sum + parseFloat(b.balance) / 1_000_000,
            0,
          );
          console.log('\n   ═══════════════════════════════════════════════════════');
          console.log('   📊 TOTAL: ' + totalShares.toFixed(2) + ' shares across ' + nonZero.length + ' positions');
          console.log('   ═══════════════════════════════════════════════════════');
        }
      } catch (e) {
        console.log('   Error fetching token balances:', (e as Error).message);
      }
    }
    console.log('');

    // Get open orders
    console.log('📋 Open Orders:');
    try {
      const orders = await adapter.getOrders({
        walletAddress: WALLET,
        chainIds: ['137'],
        status: 'open',
      });
      if (orders.orders.length === 0) {
        console.log('   No open orders');
      } else {
        console.log(`   Found ${orders.orders.length} open orders:\n`);
        for (const order of orders.orders) {
          console.log('   ─────────────────────────────────────');
          console.log('   Order:', order.orderId?.substring(0, 40) + '...');
          console.log('   Side:', order.side, '| Size:', order.size, '@ $' + order.price);
          console.log('   Status:', order.status);
        }
      }
    } catch (e) {
      console.log('   Error fetching orders:', (e as Error).message);
    }
    console.log('');

    console.log('='.repeat(60) + '\n');
  }, 60000);
});
