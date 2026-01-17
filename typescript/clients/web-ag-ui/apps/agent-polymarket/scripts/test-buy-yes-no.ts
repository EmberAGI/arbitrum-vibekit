
import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import { createAdapterFromEnv, fetchMarketsFromGamma, fetchMarketPrices } from '../src/clients/polymarketClient.js';
import { POLYGON_CONTRACTS, CONTRACT_ABIS } from '../src/constants/contracts.js';

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
  console.log('🚀 Starting Polymarket Buy YES/NO Test Script...');

  // 1. Setup Wallet
  const privateKey = process.env.A2A_TEST_AGENT_NODE_PRIVATE_KEY;
  if (!privateKey) {
      console.error('❌ Missing A2A_TEST_AGENT_NODE_PRIVATE_KEY in .env');
      process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(privateKey, provider);
  console.log(`🔑 Wallet: ${wallet.address}`);

  // 2. Initialize Adapter
  console.log('🔧 Initializing PolymarketAdapter...');
  const adapter = await createAdapterFromEnv();
  if (!adapter) {
      console.error('❌ Failed to create adapter');
      process.exit(1);
  }

  // 3. Fetch Active Markets and Pick Random One
  console.log('🔍 Fetching active markets...');

  // IMPORTANT: Call adapter.getMarkets() to populate the market cache
  // This is needed so the adapter can resolve YES/NO token IDs
  const adapterMarkets = await adapter.getMarkets({ chainIds: ['137'], status: 'active' });
  const markets = adapterMarkets.markets;
  if (markets.length === 0) {
       console.error('❌ No active markets found');
       process.exit(1);
  }

  console.log(`   Found ${markets.length} active markets`);

  // Pick a random market
  const randomIndex = Math.floor(Math.random() * markets.length);
  const targetMarket = markets[randomIndex];

  console.log(`\n✅ Randomly Selected Market #${randomIndex + 1}:`);
  console.log(`   Question: "${targetMarket.name}"`);
  console.log(`   YES Token: ${targetMarket.longToken.address}`);
  console.log(`   NO Token: ${targetMarket.shortToken.address}`);

  // 4. Check & Execute Approvals
  console.log('\n🛡️  Checking Approvals...');

  // USDC Approval
  const usdc = new ethers.Contract(POLYGON_CONTRACTS.USDC_E, CONTRACT_ABIS.USDC, wallet);
  const ctfExchange = POLYGON_CONTRACTS.CTF_EXCHANGE;

  const allowance = await usdc.allowance(wallet.address, ctfExchange);
  console.log(`   USDC Allowance: ${ethers.formatUnits(allowance, 6)} USDC`);

  if (allowance < ethers.parseUnits('100', 6)) {
      console.log('   ⚠️ Approving USDC to CTF Exchange...');
      const tx = await usdc.approve(ctfExchange, ethers.MaxUint256);
      console.log(`   Tx sent: ${tx.hash}`);
      await tx.wait();
      console.log('   ✅ USDC Approved');
  } else {
      console.log('   ✅ USDC already approved');
  }

  // CTF Contract Approval
  const ctf = new ethers.Contract(POLYGON_CONTRACTS.CTF_CONTRACT, CONTRACT_ABIS.CTF_CONTRACT, wallet);
  const isApproved = await ctf.isApprovedForAll(wallet.address, ctfExchange);
  console.log(`   CTF Approved: ${isApproved}`);

  if (!isApproved) {
      console.log('   ⚠️ Approving CTF Contract to CTF Exchange...');
      const tx = await ctf.setApprovalForAll(ctfExchange, true);
       console.log(`   Tx sent: ${tx.hash}`);
      await tx.wait();
       console.log('   ✅ CTF Approved');
  } else {
       console.log('   ✅ CTF already approved');
  }

  // 5. Calculate Order Size Based on Available USDC
  console.log('\n💰 Calculating Order Size...');
  const yesTokenId = targetMarket.longToken.address;
  const noTokenId = targetMarket.shortToken.address;

  const prices = await fetchMarketPrices(yesTokenId, noTokenId);
  console.log(`   YES Buy Price (Ask): ${prices.yesBuyPrice}`);
  console.log(`   NO Buy Price (Ask): ${prices.noBuyPrice}`);

  // Available budget: 2 USDC
  // Polymarket minimum order size: $1 USD
  // Strategy: Place single order for YES (full budget) to meet minimum
  const totalBudget = 1.8; // Use 1.8 to leave buffer for fees

  // Calculate size for YES (leave 5% buffer)
  const yesSize = prices.yesBuyPrice > 0
    ? Math.floor((totalBudget / prices.yesBuyPrice) * 0.95)
    : 0;

  const yesCost = yesSize * prices.yesBuyPrice;

  console.log(`   Strategy: Buy YES only (Polymarket requires $1 minimum per order)`);
  console.log(`   Calculated YES Size: ${yesSize} shares (~$${yesCost.toFixed(2)})`);

  if (yesCost < 1.0) {
      console.warn(`   ⚠️ Order cost $${yesCost.toFixed(2)} is below $1 minimum, increasing size...`);
      // Adjust to meet $1 minimum
      const minSize = Math.ceil(1.0 / prices.yesBuyPrice);
      const adjustedCost = minSize * prices.yesBuyPrice;
      console.log(`   Adjusted YES Size: ${minSize} shares (~$${adjustedCost.toFixed(2)})`);
  }

  // 6. Buy YES at EXACT ask price (guaranteed fill)
  console.log('\n📈 Executing Buy YES...');

  if (prices.yesBuyPrice > 0 && yesSize > 0) {
      const price = prices.yesBuyPrice.toFixed(2); // EXACT ask price for immediate fill

      console.log(`   Placing order: Buy YES, Size: ${yesSize}, Price: ${price} (exact ask)`);

      const res = await adapter.placeOrder({
          marketId: targetMarket.longToken.address,
          outcomeId: 'yes',
          side: 'buy',
          size: yesSize.toString(),
          price: price,
          chainId: '137'
      });

      if (res.success) {
          console.log(`   ✅ Buy YES Success! Order ID: ${res.orderId}`);
          console.log(`   🎉 Order placed and should fill immediately at market price!`);
      } else {
          console.error(`   ❌ Buy YES Failed: ${res.error}`);
      }
  } else {
      console.log('   ⚠️ No liquidity for YES or size too small, skipping buy');
  }

  console.log('\n✨ Test Script Complete');
}

main().catch(console.error);
