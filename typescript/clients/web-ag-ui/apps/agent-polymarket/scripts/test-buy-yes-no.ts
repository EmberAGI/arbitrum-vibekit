import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import { createAdapterFromEnv, fetchMarketPrices } from '../src/clients/polymarketClient.js';
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
  console.log('🚀 Starting Polymarket YES/NO Position Test Script...');

  // 1. Setup Wallet
  const privateKey = process.env.A2A_TEST_AGENT_NODE_PRIVATE_KEY;
  if (!privateKey) {
      console.error('❌ Missing A2A_TEST_AGENT_NODE_PRIVATE_KEY in .env');
      process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(privateKey, provider);
  const walletAddress = wallet.address;
  console.log(`🔑 Wallet: ${walletAddress}`);

  // 2. Initialize Adapter
  console.log('🔧 Initializing PolymarketAdapter...');
  const adapter = await createAdapterFromEnv();
  if (!adapter) {
      console.error('❌ Failed to create adapter');
      process.exit(1);
  }

  // 3. Fetch Existing Positions
  console.log('\n📊 Fetching Your Current Positions...');
  const { positions } = await adapter.getPositions(walletAddress);

  if (positions.length === 0) {
    console.log('❌ No positions found. Please place a YES order first using the original script.');
    process.exit(1);
  }

  console.log('\n📊 Your Current Positions:');
  for (const pos of positions) {
    console.log(`- ${pos.marketTitle}`);
    console.log(`  Outcome: ${pos.outcomeId.toUpperCase()}`);
    console.log(`  Size: ${pos.size} shares`);
    console.log(`  Avg Price: $${parseFloat(pos.avgPrice || '0').toFixed(4)}`);
    console.log(`  Current Price: $${parseFloat(pos.currentPrice || '0').toFixed(4)}`);
    console.log(`  PnL: $${parseFloat(pos.pnl || '0').toFixed(2)} (${parseFloat(pos.pnlPercent || '0').toFixed(2)}%)`);
  }

  // 4. Find YES Position and Get Market Info
  const yesPosition = positions.find(p => p.outcomeId === 'yes');

  if (!yesPosition) {
    console.log('\n❌ No YES positions found. Please place a YES order first.');
    process.exit(1);
  }

  console.log('\n✅ Found YES position to pair with NO order:');
  console.log(`Market: ${yesPosition.marketTitle}`);
  console.log(`Market ID (condition): ${yesPosition.marketId}`);
  console.log(`YES Shares: ${yesPosition.size}`);
  console.log(`YES Token ID: ${yesPosition.tokenId}`);

  // Query Gamma API to get full market details including NO token ID
  const yesTokenId = yesPosition.tokenId;
  const gammaApiUrl = process.env.POLYMARKET_GAMMA_API || 'https://gamma-api.polymarket.com';

  console.log('\n🔍 Querying Gamma API for market details...');
  const marketResponse = await fetch(`${gammaApiUrl}/markets?clob_token_ids=${yesTokenId}`);
  const markets = await marketResponse.json();

  if (!markets || markets.length === 0) {
    console.log('❌ Could not find market details from Gamma API');
    process.exit(1);
  }

  const market = markets[0];

  // Parse the clobTokenIds - it's a JSON array string
  let clobTokenIds: string[];
  if (typeof market.clobTokenIds === 'string') {
    try {
      clobTokenIds = JSON.parse(market.clobTokenIds);
    } catch (e) {
      console.log('❌ Failed to parse clobTokenIds as JSON:', market.clobTokenIds);
      process.exit(1);
    }
  } else if (Array.isArray(market.clobTokenIds)) {
    clobTokenIds = market.clobTokenIds;
  } else {
    console.log('❌ Unexpected clobTokenIds format:', market.clobTokenIds);
    process.exit(1);
  }

  const noTokenId = clobTokenIds.find((id: string) => id !== yesTokenId);

  if (!noTokenId) {
    console.log('❌ Could not find NO token ID for this market');
    console.log('Available IDs:', clobTokenIds);
    console.log('Looking for ID different from:', yesTokenId);
    process.exit(1);
  }

  console.log(`NO Token ID: ${noTokenId}`);

  // Manually add market to adapter's cache
  console.log('\n🔄 Adding market to adapter cache...');
  // Access the private marketCache via getMarkets call with the specific market
  // This ensures the adapter can resolve tokens for this market
  const adaptMarket = await adapter.getMarkets({ chainIds: ['137'], status: 'active' });
  console.log(`Loaded ${adaptMarket.markets.length} markets into cache`);

  // Get current market prices
  const prices = await fetchMarketPrices(yesTokenId, noTokenId);

  console.log(`\nCurrent Market Prices:`);
  console.log(`YES Buy: $${prices.yesBuyPrice.toFixed(4)}`);
  console.log(`NO Buy: $${prices.noBuyPrice.toFixed(4)}`);
  console.log(`Combined: $${(prices.yesBuyPrice + prices.noBuyPrice).toFixed(4)}`);

  // 5. Check & Execute Approvals
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

  // 6. Calculate NO Order Size (minimum 5 shares required by Polymarket)
  console.log(`\n💰 NO Order Calculation:`);

  // Polymarket minimum share size is 5
  const MIN_SHARES = 5;

  // Calculate shares (use minimum of 5)
  const noShares = MIN_SHARES;
  const noCost = noShares * prices.noBuyPrice;

  console.log(`Minimum Share Size: ${MIN_SHARES}`);
  console.log(`NO Price: $${prices.noBuyPrice.toFixed(4)}`);
  console.log(`NO Shares: ${noShares}`);
  console.log(`Actual Cost: $${noCost.toFixed(2)}`);

  // 7. Place NO Token Order
  console.log(`\n🔄 Placing NO token order...`);
  console.log(`Using YES token ID as market reference: ${yesTokenId}`);

  // Wait 2 seconds to avoid rate limits
  console.log('⏳ Waiting 2 seconds...');
  await new Promise(resolve => setTimeout(resolve, 2000));

  const noOrder = await adapter.placeOrder({
    marketId: yesTokenId, // Use YES token ID - adapter will resolve NO token
    outcomeId: 'no',
    side: 'buy',
    size: noShares.toString(),
    price: prices.noBuyPrice.toString(), // Use exact ask price for immediate fill
    chainId: '137',
  });

  if (noOrder.success && noOrder.orderId) {
    console.log('✅ NO order placed successfully!');
    console.log(`Order ID: ${noOrder.orderId}`);
    console.log(`Market: ${yesPosition.marketTitle}`);
    console.log(`Shares: ${noShares}`);
    console.log(`Price: $${prices.noBuyPrice.toFixed(4)}`);
    console.log(`Total Cost: $${noCost.toFixed(2)}`);
  } else {
    console.log('❌ NO order failed');
    console.log('Error:', noOrder.error);
    process.exit(1);
  }

  // 8. Verify Position
  console.log('\n⏳ Waiting 5 seconds for order to fill...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Fetch positions again
  const { positions: updatedPositions } = await adapter.getPositions(walletAddress);

  console.log('\n📊 Updated Positions:');
  for (const pos of updatedPositions) {
    if (pos.marketId === yesPosition.marketId) {
      const size = parseFloat(pos.size);
      const avgPrice = parseFloat(pos.avgPrice || '0');
      console.log(`- ${pos.marketTitle}`);
      console.log(`  Outcome: ${pos.outcomeId.toUpperCase()}`);
      console.log(`  Size: ${pos.size} shares`);
      console.log(`  Cost: $${(size * avgPrice).toFixed(2)}`);
    }
  }

  // Calculate arbitrage profit
  const yesPos = updatedPositions.find(p =>
    p.marketId === yesPosition.marketId && p.outcomeId === 'yes'
  );
  const noPos = updatedPositions.find(p =>
    p.marketId === yesPosition.marketId && p.outcomeId === 'no'
  );

  if (yesPos && noPos) {
    const yesSizeNum = parseFloat(yesPos.size);
    const noSizeNum = parseFloat(noPos.size);
    const yesAvgPrice = parseFloat(yesPos.avgPrice || '0');
    const noAvgPrice = parseFloat(noPos.avgPrice || '0');

    const minShares = Math.min(yesSizeNum, noSizeNum);
    const yesCost = minShares * yesAvgPrice;
    const noCost = minShares * noAvgPrice;
    const totalCost = yesCost + noCost;
    const guaranteedPayout = minShares * 1.0; // $1 per share when resolved
    const profit = guaranteedPayout - totalCost;
    const roi = (profit / totalCost) * 100;

    console.log('\n💎 Arbitrage Position Summary:');
    console.log(`Paired Shares: ${minShares}`);
    console.log(`YES Cost: $${yesCost.toFixed(2)}`);
    console.log(`NO Cost: $${noCost.toFixed(2)}`);
    console.log(`Total Cost: $${totalCost.toFixed(2)}`);
    console.log(`Guaranteed Payout: $${guaranteedPayout.toFixed(2)}`);
    console.log(`Expected Profit: $${profit.toFixed(3)}`);
    console.log(`ROI: ${roi.toFixed(2)}%`);
  }

  console.log('\n✨ Test Script Complete');
}

main().catch(console.error);
