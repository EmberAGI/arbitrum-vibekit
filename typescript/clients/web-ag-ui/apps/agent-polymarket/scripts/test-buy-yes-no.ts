
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

  // 3. Fetch One Active Market
  console.log('🔍 Fetching one active market...');
  const markets = await fetchMarketsFromGamma(20);
  if (markets.length === 0) {
       console.error('❌ No active markets found');
       process.exit(1);
  }

  // Pick one with decent liquidity or random
  const targetMarket = markets[0];
  console.log(`✅ Selected Market: "${targetMarket.name}"`);
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

  // 5. Buy YES
  console.log('\n📈 Executing Buy YES...');
  const yesTokenId = targetMarket.longToken.address;
  const noTokenId = targetMarket.shortToken.address;

  const prices = await fetchMarketPrices(yesTokenId, noTokenId);
  console.log(`   YES Buy Price (Ask): ${prices.yesBuyPrice}`);

  if (prices.yesBuyPrice > 0) {
      const price = (prices.yesBuyPrice + 0.01).toFixed(2); // slightly higher to cross spread if needed, or just match
      const size = "5"; // Buy 5 shares

      console.log(`   Placing order: Buy YES, Size: ${size}, Price: ${price}`);

      const res = await adapter.placeOrder({
          marketId: targetMarket.longToken.address,
          outcomeId: 'yes',
          side: 'buy',
          size: size,
          price: price,
          chainId: '137'
      });

      if (res.success) {
          console.log(`   ✅ Buy YES Success! Order ID: ${res.orderId}`);
      } else {
          console.error(`   ❌ Buy YES Failed: ${res.error}`);
      }
  } else {
      console.log('   ⚠️ No liquidity for YES, skipping buy');
  }

  // 6. Buy NO
  console.log('\n📉 Executing Buy NO...');
  console.log(`   NO Buy Price (Ask): ${prices.noBuyPrice}`);

  if (prices.noBuyPrice > 0) {
      const price = (prices.noBuyPrice + 0.01).toFixed(2);
      const size = "5";

      console.log(`   Placing order: Buy NO, Size: ${size}, Price: ${price}`);

       const res = await adapter.placeOrder({
          marketId: targetMarket.longToken.address,
          outcomeId: 'no',
          side: 'buy',
          size: size,
          price: price,
          chainId: '137'
      });

       if (res.success) {
          console.log(`   ✅ Buy NO Success! Order ID: ${res.orderId}`);
      } else {
          console.error(`   ❌ Buy NO Failed: ${res.error}`);
      }
  } else {
       console.log('   ⚠️ No liquidity for NO, skipping buy');
  }

  console.log('\n✨ Test Script Complete');
}

main().catch(console.error);
