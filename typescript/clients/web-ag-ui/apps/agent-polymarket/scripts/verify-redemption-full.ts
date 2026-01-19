import * as fs from 'fs';
import * as path from 'path';
import { ethers } from 'ethers';
import { createAdapterFromEnv } from '../src/clients/polymarketClient.js';

// Manual .env loading since dotenv is not installed
try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
        const envConfig = fs.readFileSync(envPath, 'utf8');
        for (const line of envConfig.split('\n')) {
            const trimmedLine = line.trim();
            if (!trimmedLine || trimmedLine.startsWith('#')) continue;

            const equalIndex = trimmedLine.indexOf('=');
            if (equalIndex === -1) continue;

            const key = trimmedLine.substring(0, equalIndex).trim();
            let val = trimmedLine.substring(equalIndex + 1).trim();

            // Remove quotes if present
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                val = val.slice(1, -1);
            }

            if (key && !process.env[key]) {
                process.env[key] = val;
            }
        }
    }
} catch (e) {
    console.warn('Failed to load .env file manually:', e);
}

// Contract addresses (same as in polymarketClient.ts)
const POLYGON_CONTRACTS = {
  USDC_E: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  CTF_CONTRACT: '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045',
  CTF_EXCHANGE: '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E',
  NEG_RISK_ADAPTER: '0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296',
};

const CTF_ABI = [
  'function isApprovedForAll(address owner, address operator) view returns (bool)',
  'function setApprovalForAll(address operator, bool approved)',
  'function redeemPositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] indexSets)',
];

/**
 * COMPREHENSIVE REDEMPTION FLOW VERIFICATION
 *
 * Tests ALL aspects of the redemption flow:
 * 1. Fetch positions using adapter
 * 2. Get market resolution status using tokenId
 * 3. Verify conditionId extraction (camelCase)
 * 4. Verify negRisk flag detection
 * 5. Verify CTF contract connectivity
 * 6. Check approval status
 * 7. Test bytes32 conversion for conditionId
 * 8. Simulate redemption call (read-only)
 */
async function main() {
  console.log('🔍 COMPREHENSIVE REDEMPTION FLOW VERIFICATION\n');
  console.log('=' .repeat(70));

  const results: { step: string; status: 'pass' | 'fail' | 'warn'; message: string }[] = [];

  // Get configuration - try multiple possible env var names
  const walletAddress = process.env.A2A_TEST_AGENT_NODE_PUBLIC_KEY
    || process.env.POLYMARKET_WALLET_ADDRESS
    || '';
  const privateKey = process.env.A2A_TEST_AGENT_NODE_PRIVATE_KEY
    || process.env.POLYMARKET_PRIVATE_KEY
    || '';
  const rpcUrl = process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com';

  if (!walletAddress || !privateKey) {
    console.error('❌ Missing required environment variables!');
    console.error('   Required: A2A_TEST_AGENT_NODE_PUBLIC_KEY or POLYMARKET_WALLET_ADDRESS');
    console.error('   Required: A2A_TEST_AGENT_NODE_PRIVATE_KEY or POLYMARKET_PRIVATE_KEY');
    console.error('\n   Available env vars:');
    console.error(`   - A2A_TEST_AGENT_NODE_PUBLIC_KEY: ${process.env.A2A_TEST_AGENT_NODE_PUBLIC_KEY ? 'SET' : 'NOT SET'}`);
    console.error(`   - A2A_TEST_AGENT_NODE_PRIVATE_KEY: ${process.env.A2A_TEST_AGENT_NODE_PRIVATE_KEY ? 'SET' : 'NOT SET'}`);
    console.error(`   - POLYMARKET_WALLET_ADDRESS: ${process.env.POLYMARKET_WALLET_ADDRESS ? 'SET' : 'NOT SET'}`);
    console.error(`   - POLYMARKET_PRIVATE_KEY: ${process.env.POLYMARKET_PRIVATE_KEY ? 'SET' : 'NOT SET'}`);
    process.exit(1);
  }

  console.log(`📍 Wallet: ${walletAddress}`);
  console.log(`🔗 RPC: ${rpcUrl}\n`);

  // STEP 1: Create Adapter
  console.log('━'.repeat(70));
  console.log('📌 STEP 1: Create Adapter\n');

  const adapter = await createAdapterFromEnv();
  if (!adapter) {
    results.push({ step: 'Create Adapter', status: 'fail', message: 'Failed to create adapter' });
    console.error('❌ Failed to create adapter');
    printResults(results);
    process.exit(1);
  }
  results.push({ step: 'Create Adapter', status: 'pass', message: 'Adapter created successfully' });
  console.log('   ✅ Adapter created successfully\n');

  // STEP 2: Fetch Positions
  console.log('━'.repeat(70));
  console.log('📌 STEP 2: Fetch Positions\n');

  const { positions } = await adapter.getPositions(walletAddress);

  if (positions.length === 0) {
    results.push({ step: 'Fetch Positions', status: 'warn', message: 'No positions found' });
    console.log('   ⚠️ No positions found - nothing to redeem');
    printResults(results);
    process.exit(0);
  }

  results.push({ step: 'Fetch Positions', status: 'pass', message: `Found ${positions.length} position(s)` });
  console.log(`   ✅ Found ${positions.length} position(s)\n`);

  for (const pos of positions) {
    console.log(`   📊 ${pos.marketTitle?.substring(0, 40)}...`);
    console.log(`      ├─ Side: ${pos.outcomeId.toUpperCase()}`);
    console.log(`      ├─ TokenId: ${pos.tokenId.substring(0, 30)}...`);
    console.log(`      └─ MarketId: ${pos.marketId.substring(0, 30)}...`);
  }

  // STEP 3: Test Market Resolution API (using tokenId)
  console.log('\n' + '━'.repeat(70));
  console.log('📌 STEP 3: Test Market Resolution API\n');

  const firstPosition = positions[0];
  const tokenId = firstPosition.tokenId;

  console.log(`   Testing with tokenId: ${tokenId.substring(0, 30)}...`);

  const resolution = await adapter.getMarketResolution(tokenId);

  console.log(`   └─ Resolution Status:`);
  console.log(`      ├─ Resolved: ${resolution.resolved ? '✅ YES' : '❌ NO'}`);
  if (resolution.resolved) {
    console.log(`      ├─ Winning Outcome: ${resolution.winningOutcome}`);
    console.log(`      └─ Resolution Date: ${resolution.resolutionDate}`);
  } else {
    console.log(`      └─ Market is still OPEN`);
  }

  results.push({
    step: 'Market Resolution API',
    status: 'pass',
    message: `API works, resolved=${resolution.resolved}`
  });

  // STEP 4: Verify Raw Gamma API Response (conditionId, negRisk)
  console.log('\n' + '━'.repeat(70));
  console.log('📌 STEP 4: Verify Raw Gamma API Response\n');

  const gammaUrl = `https://gamma-api.polymarket.com/markets?clob_token_ids=${tokenId}`;
  const gammaResponse = await fetch(gammaUrl);
  const gammaData = await gammaResponse.json() as Array<{
    id?: string;
    question?: string;
    conditionId?: string;
    negRisk?: boolean;
    closed?: boolean;
    outcome?: string;
  }>;

  if (!Array.isArray(gammaData) || gammaData.length === 0) {
    results.push({ step: 'Gamma API Response', status: 'fail', message: 'No market data returned' });
    console.log('   ❌ No market data returned from Gamma API');
  } else {
    const market = gammaData[0];
    console.log(`   Market: ${market.question?.substring(0, 50)}...`);
    console.log(`   ├─ ID: ${market.id}`);
    console.log(`   ├─ ConditionId: ${market.conditionId ? '✅ Present' : '❌ MISSING'}`);
    if (market.conditionId) {
      console.log(`   │  Value: ${market.conditionId.substring(0, 30)}...`);
    }
    console.log(`   ├─ NegRisk: ${market.negRisk}`);
    console.log(`   ├─ Closed: ${market.closed}`);
    console.log(`   └─ Outcome: ${market.outcome || 'N/A'}`);

    if (market.conditionId) {
      results.push({ step: 'Gamma API Response', status: 'pass', message: 'conditionId & negRisk present' });
    } else {
      results.push({ step: 'Gamma API Response', status: 'fail', message: 'conditionId missing!' });
    }
  }

  // STEP 5: Test bytes32 Conversion
  console.log('\n' + '━'.repeat(70));
  console.log('📌 STEP 5: Test bytes32 Conversion\n');

  const conditionIdHex = (gammaData[0]?.conditionId || firstPosition.marketId);

  try {
    const conditionIdBytes32 = conditionIdHex.startsWith('0x')
      ? ethers.zeroPadValue(conditionIdHex, 32)
      : ethers.zeroPadValue(`0x${conditionIdHex}`, 32);

    console.log(`   Input:  ${conditionIdHex.substring(0, 40)}...`);
    console.log(`   Output: ${conditionIdBytes32.substring(0, 40)}...`);
    console.log(`   Length: ${conditionIdBytes32.length} chars (expected: 66)`);

    if (conditionIdBytes32.length === 66) {
      results.push({ step: 'bytes32 Conversion', status: 'pass', message: 'Conversion successful' });
      console.log('   ✅ Conversion successful');
    } else {
      results.push({ step: 'bytes32 Conversion', status: 'fail', message: 'Invalid length' });
      console.log('   ❌ Invalid bytes32 length');
    }
  } catch (e) {
    results.push({ step: 'bytes32 Conversion', status: 'fail', message: String(e) });
    console.log(`   ❌ Conversion failed: ${e}`);
  }

  // STEP 6: Test CTF Contract Connectivity
  console.log('\n' + '━'.repeat(70));
  console.log('📌 STEP 6: Test CTF Contract Connectivity\n');

  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);
    const ctfContract = new ethers.Contract(POLYGON_CONTRACTS.CTF_CONTRACT, CTF_ABI, wallet);

    console.log(`   CTF Contract: ${POLYGON_CONTRACTS.CTF_CONTRACT}`);
    console.log(`   Wallet: ${wallet.address}`);

    // Check code exists at contract address
    const code = await provider.getCode(POLYGON_CONTRACTS.CTF_CONTRACT);
    if (code !== '0x') {
      console.log(`   Contract Code: ✅ Present (${code.length} bytes)`);
      results.push({ step: 'CTF Contract', status: 'pass', message: 'Contract accessible' });
    } else {
      console.log(`   Contract Code: ❌ No code at address`);
      results.push({ step: 'CTF Contract', status: 'fail', message: 'No code at address' });
    }

    // STEP 7: Check Approval Status
    console.log('\n' + '━'.repeat(70));
    console.log('📌 STEP 7: Check Approval Status\n');

    const negRisk = gammaData[0]?.negRisk ?? false;
    const operatorAddress = negRisk
      ? POLYGON_CONTRACTS.NEG_RISK_ADAPTER
      : POLYGON_CONTRACTS.CTF_EXCHANGE;

    console.log(`   Market Type: ${negRisk ? 'Neg Risk' : 'Regular'}`);
    console.log(`   Operator: ${operatorAddress}`);

    const isApproved = await ctfContract.isApprovedForAll(wallet.address, operatorAddress);

    console.log(`   Approved: ${isApproved ? '✅ YES' : '❌ NO'}`);

    if (isApproved) {
      results.push({ step: 'Approval Status', status: 'pass', message: 'Already approved' });
    } else {
      results.push({ step: 'Approval Status', status: 'warn', message: 'Not approved - will need approval tx' });
      console.log(`   ⚠️ Will need to call setApprovalForAll before redemption`);
    }

    // STEP 8: Simulate Redemption Call (encode only, don't send)
    console.log('\n' + '━'.repeat(70));
    console.log('📌 STEP 8: Simulate Redemption Call\n');

    const indexSets = firstPosition.outcomeId === 'yes' ? [1] : [2];
    const conditionIdBytes32 = conditionIdHex.startsWith('0x')
      ? ethers.zeroPadValue(conditionIdHex, 32)
      : ethers.zeroPadValue(`0x${conditionIdHex}`, 32);

    console.log(`   Parameters:`);
    console.log(`   ├─ Collateral: ${POLYGON_CONTRACTS.USDC_E}`);
    console.log(`   ├─ Parent Collection: ${ethers.ZeroHash}`);
    console.log(`   ├─ Condition ID: ${conditionIdBytes32.substring(0, 30)}...`);
    console.log(`   └─ Index Sets: [${indexSets.join(', ')}] (${firstPosition.outcomeId.toUpperCase()})`);

    // Try to encode the call data
    try {
      const iface = new ethers.Interface(CTF_ABI);
      const callData = iface.encodeFunctionData('redeemPositions', [
        POLYGON_CONTRACTS.USDC_E,
        ethers.ZeroHash,
        conditionIdBytes32,
        indexSets,
      ]);

      console.log(`\n   Encoded Call Data: ${callData.substring(0, 50)}...`);
      console.log(`   Call Data Length: ${callData.length} chars`);

      results.push({ step: 'Redemption Call Encoding', status: 'pass', message: 'Call data encoded successfully' });
      console.log('   ✅ Redemption call can be encoded successfully');

      // Static call to verify contract accepts the call (only if market is resolved)
      if (resolution.resolved) {
        console.log('\n   Attempting static call (dry run)...');
        try {
          await ctfContract.redeemPositions.staticCall(
            POLYGON_CONTRACTS.USDC_E,
            ethers.ZeroHash,
            conditionIdBytes32,
            indexSets,
          );
          console.log('   ✅ Static call succeeded - redemption should work!');
          results.push({ step: 'Static Call', status: 'pass', message: 'Dry run successful' });
        } catch (staticErr) {
          console.log(`   ⚠️ Static call failed: ${staticErr}`);
          results.push({ step: 'Static Call', status: 'warn', message: String(staticErr) });
        }
      } else {
        console.log('\n   ℹ️ Skipping static call - market not resolved');
        results.push({ step: 'Static Call', status: 'warn', message: 'Skipped - market not resolved' });
      }

    } catch (encodeErr) {
      results.push({ step: 'Redemption Call Encoding', status: 'fail', message: String(encodeErr) });
      console.log(`   ❌ Failed to encode call: ${encodeErr}`);
    }

  } catch (e) {
    results.push({ step: 'CTF Contract', status: 'fail', message: String(e) });
    console.log(`   ❌ Contract test failed: ${e}`);
  }

  // Print Final Results
  printResults(results);
}

function printResults(results: { step: string; status: 'pass' | 'fail' | 'warn'; message: string }[]) {
  console.log('\n' + '═'.repeat(70));
  console.log('📋 VERIFICATION RESULTS\n');

  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const warned = results.filter(r => r.status === 'warn').length;

  for (const result of results) {
    const icon = result.status === 'pass' ? '✅' : result.status === 'fail' ? '❌' : '⚠️';
    console.log(`   ${icon} ${result.step}: ${result.message}`);
  }

  console.log('\n' + '─'.repeat(70));
  console.log(`   Total: ${results.length} | Passed: ${passed} | Failed: ${failed} | Warnings: ${warned}`);

  if (failed > 0) {
    console.log('\n   🚨 REDEMPTION FLOW HAS ISSUES - FIX BEFORE DEPLOYING');
  } else if (warned > 0) {
    console.log('\n   ⚠️ REDEMPTION FLOW MOSTLY READY - CHECK WARNINGS');
  } else {
    console.log('\n   ✅ REDEMPTION FLOW VERIFIED - READY FOR PRODUCTION');
  }

  console.log('═'.repeat(70) + '\n');
}

main().catch(console.error);
