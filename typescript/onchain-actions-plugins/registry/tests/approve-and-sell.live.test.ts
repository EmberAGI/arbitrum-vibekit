/**
 * Approve CTF Exchange and sell 25 YES shares
 */

import { describe, it } from 'vitest';
import { PolymarketAdapter } from '../src/polymarket-plugin/adapter.js';
import { ethers } from 'ethers';

const PRIVATE_KEY = process.env['POLYMARKET_PRIVATE_KEY'];
const WALLET = '0x73b45E9DC72dC32Fb6b539d006e9Cb78830c18F5';

// Contract addresses
const CTF_EXCHANGE = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';
const CTF_CONTRACT = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';

describe('Approve and Sell', () => {
  it('should approve CTF Exchange and sell tokens', async () => {
    if (!PRIVATE_KEY) {
      console.log('\n⚠️  POLYMARKET_PRIVATE_KEY not set');
      return;
    }

    console.log('\n' + '='.repeat(60));
    console.log('🔓 Approving CTF Exchange & Selling Tokens');
    console.log('='.repeat(60));

    // Connect to Polygon (ethers v5 syntax)
    const provider = new ethers.providers.JsonRpcProvider('https://polygon-rpc.com');
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

    console.log('\n📍 Wallet:', wallet.address);

    // Check current approval status
    const ctfAbi = [
      'function isApprovedForAll(address owner, address operator) view returns (bool)',
      'function setApprovalForAll(address operator, bool approved)',
    ];
    const ctfContract = new ethers.Contract(CTF_CONTRACT, ctfAbi, wallet);

    const isApproved = await ctfContract.isApprovedForAll(wallet.address, CTF_EXCHANGE);
    console.log('   Current approval status:', isApproved ? '✅ Approved' : '❌ Not Approved');

    if (!isApproved) {
      console.log('\n🔐 Sending approval transaction...');
      console.log('   CTF Contract:', CTF_CONTRACT);
      console.log('   Approving operator:', CTF_EXCHANGE);

      try {
        // Get current gas price and add buffer
        const feeData = await provider.getFeeData();
        const gasPrice = feeData.gasPrice ? feeData.gasPrice.mul(120).div(100) : undefined; // 20% buffer

        console.log('   Gas price:', gasPrice?.toString(), 'wei');

        const tx = await ctfContract.setApprovalForAll(CTF_EXCHANGE, true, {
          gasLimit: 100000,
          gasPrice: gasPrice,
        });
        console.log('   Transaction hash:', tx.hash);
        console.log('   View on PolygonScan: https://polygonscan.com/tx/' + tx.hash);
        console.log('   Waiting for confirmation (up to 60s)...');

        const receipt = await tx.wait(1); // Wait for 1 confirmation
        console.log('   ✅ Approved! Block:', receipt?.blockNumber);
      } catch (error) {
        console.log('   ❌ Approval failed:', (error as Error).message);
        return;
      }
    }

    // Now sell the tokens
    console.log('\n📉 Placing SELL order...');

    const adapter = new PolymarketAdapter({
      chainId: 137,
      funderAddress: WALLET,
      privateKey: PRIVATE_KEY,
      signatureType: 0,
    });

    // Get market info
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

    const yesOutcome = market.outcomes.find((o) => o.outcomeId === 'yes');
    const currentPrice = parseFloat(yesOutcome?.price || '0.05');
    const sellPrice = Math.floor(currentPrice * 100) / 100; // Round to tick

    console.log('   Market:', market.title);
    console.log('   Current YES price: $' + currentPrice.toFixed(4));
    console.log('   Sell price: $' + sellPrice.toFixed(2));
    console.log('   Size: 25 shares');

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
        console.log('\n✅ SELL ORDER PLACED!');
        console.log('   Order ID:', result.orderId);
        console.log('   Expected proceeds: ~$' + (25 * sellPrice).toFixed(2));
      } else {
        console.log('\n❌ Order failed:', (result as { error?: string }).error);
      }
    } catch (error) {
      console.log('\n❌ Error:', (error as Error).message);
    }

    console.log('\n' + '='.repeat(60) + '\n');
  }, 180000); // 3 minute timeout for on-chain tx
});
