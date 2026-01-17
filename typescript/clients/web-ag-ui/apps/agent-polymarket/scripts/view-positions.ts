import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import { createAdapterFromEnv } from '../src/clients/polymarketClient.js';

// Manual .env loading since dotenv is not installed
try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
        const envConfig = fs.readFileSync(envPath, 'utf8');
        for (const line of envConfig.split('\n')) {
            const [key, ...values] = line.split('=');
            if (key && values.length > 0) {
                const val = values.join('=').trim().replace(/^["'](.*)["']$/, '$1'); // Remove quotes
                if (!process.env[key.trim()] && !key.trim().startsWith('#')) {
                    process.env[key.trim()] = val;
                }
            }
        }
    }
} catch (e) {
    console.warn('Failed to load .env file manually:', e);
}

const RPC_URL = process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com';

async function main() {
  console.log('📊 Polymarket Position Viewer\n');
  console.log('='.repeat(80));

  // 1. Setup Wallet
  const privateKey = process.env.A2A_TEST_AGENT_NODE_PRIVATE_KEY;
  if (!privateKey) {
      console.error('❌ Missing A2A_TEST_AGENT_NODE_PRIVATE_KEY in .env');
      process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(privateKey, provider);
  console.log(`🔑 Wallet: ${wallet.address}\n`);

  // 2. Initialize Adapter
  console.log('🔧 Initializing PolymarketAdapter...');
  const adapter = await createAdapterFromEnv();
  if (!adapter) {
      console.error('❌ Failed to create adapter');
      process.exit(1);
  }
  console.log('✅ Adapter initialized\n');

  // 3. Fetch USDC Balance
  console.log('💰 Fetching USDC Balance...');
  const usdcBalance = await adapter.getUSDCBalance(wallet.address);
  console.log(`   USDC Balance: ${usdcBalance.toFixed(2)} USDC\n`);

  // 4. Fetch Positions using proper adapter function
  console.log('📈 Fetching Your Positions...');
  const { positions } = await adapter.getPositions(wallet.address);

  if (positions.length === 0) {
      console.log('   ℹ️  No open positions found.\n');
      console.log('='.repeat(80));
      console.log(`\n💵 USDC Available: ${usdcBalance.toFixed(2)} USDC`);
      return;
  }

  console.log(`   Found ${positions.length} position(s)\n`);
  console.log('='.repeat(80));

  // 5. Display Each Position with Details
  for (let i = 0; i < positions.length; i++) {
      const pos = positions[i];

      console.log(`\n📍 Position #${i + 1}`);
      console.log('-'.repeat(80));
      console.log(`Market:      ${pos.marketTitle}`);
      console.log(`Market ID:   ${pos.marketId}`);
      console.log(`Outcome:     ${pos.outcomeId} (${pos.outcomeId.toUpperCase()})`);
      console.log(`Token ID:    ${pos.tokenId.substring(0, 20)}...`);

      // Convert size from raw units (6 decimals) to shares
      const sizeInShares = Number(pos.size) / 1e6;
      console.log(`Size:        ${sizeInShares.toFixed(2)} shares`);

      if (pos.currentPrice) {
          const price = Number(pos.currentPrice);
          console.log(`Price:       $${price.toFixed(3)}`);
          const value = sizeInShares * price;
          console.log(`Est. Value:  $${value.toFixed(2)} USDC`);
      }
  }

  console.log('\n' + '='.repeat(80));
  console.log('\n✨ Position Summary Complete');

  // 6. Calculate Total Portfolio Value
  const totalShares = positions.reduce((sum, p) => sum + Number(p.size) / 1e6, 0);
  const totalValue = positions.reduce((sum, p) => {
    const shares = Number(p.size) / 1e6;
    const price = p.currentPrice ? Number(p.currentPrice) : 0;
    return sum + (shares * price);
  }, 0);

  console.log(`\n📊 Total Shares Held: ${totalShares.toFixed(2)} shares across ${positions.length} position(s)`);
  console.log(`💰 Total Position Value: $${totalValue.toFixed(2)} USDC`);
  console.log(`💵 USDC Available: ${usdcBalance.toFixed(2)} USDC`);
  console.log(`💎 Total Portfolio: $${(totalValue + usdcBalance).toFixed(2)} USDC`);
}

main().catch(console.error);
