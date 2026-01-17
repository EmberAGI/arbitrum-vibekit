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
  console.log('📊 Polymarket Activity Viewer\n');
  console.log('='.repeat(80));

  // 1. Setup Wallet
  const privateKey = process.env.A2A_TEST_AGENT_NODE_PRIVATE_KEY;
  if (!privateKey) {
      console.error('❌ Missing A2A_TEST_AGENT_NODE_PRIVATE_KEY in .env');
      process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(privateKey, provider);
  const walletAddress = wallet.address;
  console.log(`🔑 Wallet: ${walletAddress}\n`);

  // 2. Initialize PolymarketAdapter
  console.log('🔧 Initializing PolymarketAdapter...');
  const adapter = await createAdapterFromEnv();
  if (!adapter) {
    console.error('❌ Failed to create adapter');
    process.exit(1);
  }
  console.log('✅ Adapter initialized\n');

  console.log('='.repeat(80));
  console.log('\n💰 USDC BALANCE\n');
  console.log('-'.repeat(80));

  // 3. Get USDC Balance (using direct RPC call)
  const USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
  const data = `0x70a08231${walletAddress.slice(2).padStart(64, '0')}`;
  const response = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_call',
      params: [{ to: USDC_ADDRESS, data }, 'latest'],
      id: 1,
    }),
  });
  const result = (await response.json()) as { result?: string };
  const usdcBalance = result.result && result.result !== '0x'
    ? Number(BigInt(result.result)) / 1_000_000
    : 0;
  console.log(`USDC Balance: ${usdcBalance.toFixed(2)} USDC`);

  console.log('\n' + '='.repeat(80));
  console.log('\n📋 OPEN ORDERS (Pending)\n');
  console.log('-'.repeat(80));

  // 4. Get Open Orders
  try {
    const { orders } = await adapter.getOrders(walletAddress);

    if (orders.length === 0) {
      console.log('No open orders found.\n');
    } else {
      console.log(`Found ${orders.length} open order(s):\n`);

      for (let i = 0; i < orders.length; i++) {
        const order = orders[i];
        console.log(`Order #${i + 1}:`);
        console.log(`  Order ID:    ${order.orderId}`);
        console.log(`  Market ID:   ${order.marketId.substring(0, 20)}...`);
        console.log(`  Outcome:     ${order.outcomeId.toUpperCase()}`);
        console.log(`  Side:        ${order.side.toUpperCase()}`);
        console.log(`  Price:       $${order.price}`);
        console.log(`  Size:        ${order.size} shares`);
        console.log(`  Filled:      ${order.filledSize} shares`);
        console.log(`  Status:      ${order.status.toUpperCase()}`);
        console.log(`  Created:     ${new Date(order.createdAt).toLocaleString()}`);
        console.log('');
      }
    }
  } catch (error) {
    console.log(`Error fetching orders: ${error}`);
  }

  console.log('='.repeat(80));
  console.log('\n📜 TRADING HISTORY (Filled Orders)\n');
  console.log('-'.repeat(80));

  // 5. Get Trading History with Details
  try {
    const trades = await adapter.getTradingHistoryWithDetails(walletAddress, { limit: 20 });

    if (trades.length === 0) {
      console.log('No trading history found.\n');
    } else {
      console.log(`Found ${trades.length} trade(s):\n`);

      for (let i = 0; i < trades.length; i++) {
        const trade = trades[i];
        console.log(`Trade #${i + 1}:`);
        console.log(`  Market:      ${trade.marketTitle}`);
        console.log(`  Side:        ${trade.side.toUpperCase()}`);
        console.log(`  Outcome:     ${trade.outcome}`);
        console.log(`  Size:        ${trade.size} shares`);
        console.log(`  Price:       $${trade.price}`);
        if (trade.matchTime) {
          console.log(`  Time:        ${new Date(Number(trade.matchTime) * 1000).toLocaleString()}`);
        }
        console.log('');
      }
    }
  } catch (error) {
    console.log(`Error fetching trading history: ${error}\n`);
  }

  console.log('='.repeat(80));
  console.log('\n📈 CURRENT POSITIONS\n');
  console.log('-'.repeat(80));

  // 6. Get Current Positions
  try {
    const { positions } = await adapter.getPositions(walletAddress);

    if (positions.length === 0) {
      console.log('No current positions found.\n');
    } else {
      console.log(`Found ${positions.length} position(s):\n`);

      let totalValue = 0;

      for (let i = 0; i < positions.length; i++) {
        const pos = positions[i];
        const sizeInShares = Number(pos.size) / 1e6; // Convert from raw units
        const price = pos.currentPrice ? Number(pos.currentPrice) : 0;
        const avgPrice = pos.avgPrice ? Number(pos.avgPrice) : 0;
        const value = sizeInShares * price;
        const pnl = pos.pnl ? Number(pos.pnl) : 0;
        const pnlPercent = pos.pnlPercent ? Number(pos.pnlPercent) : 0;
        totalValue += value;

        console.log(`Position #${i + 1}:`);
        console.log(`  Market:      ${pos.marketTitle}`);
        console.log(`  Market ID:   ${pos.marketId.substring(0, 20)}...`);
        console.log(`  Outcome:     ${pos.outcomeName} (${pos.outcomeId.toUpperCase()})`);
        console.log(`  Size:        ${sizeInShares.toFixed(2)} shares`);
        if (pos.avgPrice) {
          console.log(`  Avg Price:   $${avgPrice.toFixed(3)}`);
        }
        if (pos.currentPrice) {
          console.log(`  Curr Price:  $${price.toFixed(3)}`);
          console.log(`  Curr Value:  $${value.toFixed(2)} USDC`);
        }
        if (pos.pnl) {
          const pnlSign = pnl >= 0 ? '+' : '';
          console.log(`  PnL:         ${pnlSign}$${pnl.toFixed(2)} (${pnlSign}${pnlPercent.toFixed(1)}%)`);
        }
        console.log('');
      }

      console.log('-'.repeat(80));
      console.log(`Total Position Value: $${totalValue.toFixed(2)} USDC\n`);
    }
  } catch (error) {
    console.log(`Error fetching positions: ${error}\n`);
  }

  console.log('='.repeat(80));
  console.log('\n📊 PORTFOLIO SUMMARY\n');
  console.log('-'.repeat(80));

  try {
    const { positions } = await adapter.getPositions(walletAddress);
    const totalPositionValue = positions.reduce((sum, p) => {
      const shares = Number(p.size) / 1e6;
      const price = p.currentPrice ? Number(p.currentPrice) : 0;
      return sum + (shares * price);
    }, 0);

    console.log(`USDC Available:       $${usdcBalance.toFixed(2)}`);
    console.log(`Position Value:       $${totalPositionValue.toFixed(2)}`);
    console.log(`Total Portfolio:      $${(usdcBalance + totalPositionValue).toFixed(2)}`);
  } catch (error) {
    console.log(`USDC Available:       $${usdcBalance.toFixed(2)}`);
    console.log(`Position Value:       $0.00`);
    console.log(`Total Portfolio:      $${usdcBalance.toFixed(2)}`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('\n✨ Activity Summary Complete\n');
}

main().catch(console.error);
