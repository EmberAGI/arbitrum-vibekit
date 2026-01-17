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
  console.log('📋 Polymarket Order Status Checker\n');
  console.log('='.repeat(80));

  // Get order ID from command line args
  const orderId = process.argv[2];

  if (!orderId) {
      console.error('❌ Usage: pnpm tsx scripts/check-order-status.ts <ORDER_ID>');
      console.log('\nExample:');
      console.log('  pnpm tsx scripts/check-order-status.ts 0x4cac7a9af2a04c4ce73d5556dcd35dc70fd73a81ec30841931d12149c5457ad9');
      process.exit(1);
  }

  // 1. Setup Wallet
  const privateKey = process.env.A2A_TEST_AGENT_NODE_PRIVATE_KEY;
  if (!privateKey) {
      console.error('❌ Missing A2A_TEST_AGENT_NODE_PRIVATE_KEY in .env');
      process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(privateKey, provider);
  console.log(`🔑 Wallet: ${wallet.address}`);
  console.log(`📝 Order ID: ${orderId}\n`);

  // 2. Initialize Adapter
  console.log('🔧 Initializing PolymarketAdapter...');
  const adapter = await createAdapterFromEnv();
  if (!adapter) {
      console.error('❌ Failed to create adapter');
      process.exit(1);
  }
  console.log('✅ Adapter initialized\n');

  // 3. Check Order Status
  console.log('🔍 Checking order status...\n');

  const status = await adapter.getOrderStatus(orderId);

  console.log('='.repeat(80));
  console.log('\n📊 Order Status:');
  console.log('-'.repeat(80));
  console.log(`Status:          ${status.status.toUpperCase()}`);
  console.log(`Size Filled:     ${status.sizeFilled} shares`);
  console.log(`Size Remaining:  ${status.sizeRemaining} shares`);

  // Status indicators
  if (status.status === 'filled') {
      console.log('\n✅ Order FULLY FILLED!');
  } else if (status.status === 'partially_filled') {
      const fillPercent = (parseFloat(status.sizeFilled) / (parseFloat(status.sizeFilled) + parseFloat(status.sizeRemaining))) * 100;
      console.log(`\n⏳ Order PARTIALLY FILLED (${fillPercent.toFixed(1)}%)`);
  } else if (status.status === 'open') {
      console.log('\n⏳ Order still OPEN (waiting for fill)');
  } else if (status.status === 'cancelled') {
      console.log('\n❌ Order CANCELLED');
  }

  console.log('\n' + '='.repeat(80));
}

main().catch(console.error);
