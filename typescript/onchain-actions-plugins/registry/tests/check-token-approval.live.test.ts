/**
 * Check token approval status and actual token ID vs market token ID
 */

import { describe, it } from 'vitest';
import { PolymarketAdapter } from '../src/polymarket-plugin/adapter.js';

const PRIVATE_KEY = process.env['POLYMARKET_PRIVATE_KEY'];
const WALLET = '0x73b45E9DC72dC32Fb6b539d006e9Cb78830c18F5';

// Contract addresses
const CTF_EXCHANGE = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';
const CTF_CONTRACT = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';

describe('Check Token Approval', () => {
  it('should check token ID and approval status', async () => {
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
    console.log('🔍 Checking Token ID & Approval Status');
    console.log('='.repeat(60));

    // 1. Get the market and its token IDs
    console.log('\n📊 Getting market token IDs...');
    const markets = await adapter.getMarkets({
      chainIds: ['137'],
      status: 'active',
      limit: 200,
    });

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

    console.log('   Market:', market.title);
    console.log('   Market ID:', market.marketId);

    const yesOutcome = market.outcomes.find((o) => o.outcomeId === 'yes');
    console.log('   YES Token ID from market:', yesOutcome?.tokenId);

    // 2. Get your actual token balance for this market
    console.log('\n💰 Getting your token balance...');
    const history = await adapter.getTradingHistory(WALLET, { limit: 20 });
    const tradesInMarket = history.filter(
      (t) => t.market === '0x22ac5f75af18fdb453497fbf7ac0aec1a4e0c51fa1af2d8b8e80f9e6b5b16a15',
    );

    // Get unique token IDs from your trades
    const yourTokenIds = [...new Set(history.map((t) => t.asset_id).filter(Boolean))];
    console.log('   Your token IDs from trades:', yourTokenIds.length);

    // Check balance for each
    if (yourTokenIds.length > 0) {
      const balances = await adapter.getTokenBalances(WALLET, yourTokenIds as string[]);
      const nonZero = balances.filter((b) => parseFloat(b.balance) > 0);

      console.log('\n   Your tokens with balance > 0:');
      for (const b of nonZero) {
        console.log('   ─────────────────────────────────────');
        console.log('   Token ID:', b.tokenId);
        console.log('   Balance:', (parseFloat(b.balance) / 1_000_000).toFixed(2), 'shares');
      }

      // Compare with market token ID
      if (yesOutcome?.tokenId) {
        const hasMatchingToken = nonZero.some((b) => b.tokenId === yesOutcome.tokenId);
        console.log('\n   Market YES Token matches your holdings?', hasMatchingToken ? '✅ YES' : '❌ NO');

        if (!hasMatchingToken) {
          console.log('\n   ⚠️  TOKEN MISMATCH!');
          console.log('   Market expects:', yesOutcome.tokenId.substring(0, 40) + '...');
          console.log('   You have:');
          for (const b of nonZero) {
            console.log('     -', b.tokenId.substring(0, 40) + '...');
          }
        }
      }
    }

    // 3. Check approval status
    console.log('\n🔐 Checking CTF Exchange approval...');
    try {
      // isApprovedForAll(owner, operator) selector: 0xe985e9c5
      const data = `0xe985e9c5${WALLET.slice(2).padStart(64, '0')}${CTF_EXCHANGE.slice(2).padStart(64, '0')}`;

      const response = await fetch('https://polygon-rpc.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_call',
          params: [{ to: CTF_CONTRACT, data }, 'latest'],
          id: 1,
        }),
      });

      const result = (await response.json()) as { result?: string };
      const isApproved = result.result && BigInt(result.result) > 0n;

      console.log('   CTF Contract:', CTF_CONTRACT);
      console.log('   CTF Exchange:', CTF_EXCHANGE);
      console.log('   Is Approved?', isApproved ? '✅ YES' : '❌ NO');

      if (!isApproved) {
        console.log('\n   ⚠️  You need to approve the CTF Exchange to sell tokens!');
        console.log('   This requires an on-chain transaction.');
        console.log('   Visit Polymarket and try to sell there first to set up approval.');
      }
    } catch (e) {
      console.log('   Error checking approval:', (e as Error).message);
    }

    console.log('\n' + '='.repeat(60) + '\n');
  }, 60000);
});
