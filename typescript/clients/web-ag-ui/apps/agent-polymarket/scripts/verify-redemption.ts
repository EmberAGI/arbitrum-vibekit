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

/**
 * Verification Script: Test getMarketResolution and redemption flow
 * This verifies:
 * 1. Positions are fetched correctly
 * 2. getMarketResolution works with condition IDs
 * 3. Market resolution status is correct
 */
async function main() {
  console.log('🔍 VERIFICATION SCRIPT: Market Resolution & Redemption Check\n');
  console.log('=' .repeat(70));

  // 1. Get wallet address
  const walletAddress = process.env.A2A_TEST_AGENT_NODE_PUBLIC_KEY || '0xdf0D52E031759f0B7b02e9fB45F09Eea731f9128';
  console.log(`📍 Wallet: ${walletAddress}\n`);

  // 2. Create adapter
  const adapter = await createAdapterFromEnv();
  if (!adapter) {
    console.error('❌ Failed to create adapter');
    process.exit(1);
  }

  // 3. Fetch positions using adapter method
  console.log('📊 Fetching positions using adapter.getPositions()...\n');
  const { positions } = await adapter.getPositions(walletAddress);

  if (positions.length === 0) {
    console.log('❌ No positions found!');
    process.exit(1);
  }

  console.log(`✅ Found ${positions.length} position(s)\n`);
  console.log('=' .repeat(70));

  // 4. Group positions by market (conditionId)
  const marketGroups = new Map<string, typeof positions>();
  for (const pos of positions) {
    if (!marketGroups.has(pos.marketId)) {
      marketGroups.set(pos.marketId, []);
    }
    marketGroups.get(pos.marketId)!.push(pos);
  }

  console.log(`\n📈 Found ${marketGroups.size} unique market(s)\n`);

  // 5. Test getMarketResolution for each market
  for (const [marketId, marketPositions] of marketGroups.entries()) {
    const firstPos = marketPositions[0];

    console.log('=' .repeat(70));
    console.log(`\n📈 MARKET: ${firstPos.marketTitle}`);
    console.log(`   Condition ID: ${marketId}`);
    console.log(`   ID Format: ${marketId.startsWith('0x') ? '✅ Condition ID (hex) - will use ?condition_id=' : '⚠️ Other format - will use /{id}'}`);

    // Show positions
    console.log('\n   📊 YOUR POSITIONS:');
    for (const pos of marketPositions) {
      const size = parseFloat(pos.size);
      const avgPrice = parseFloat(pos.avgPrice || '0');
      const currentPrice = parseFloat(pos.currentPrice || '0');
      console.log(`   ├─ ${pos.outcomeId.toUpperCase()}: ${size} shares @ $${avgPrice.toFixed(4)} (current: $${currentPrice.toFixed(4)})`);
    }

    // Test getMarketResolution with tokenId (not marketId/conditionId)
    const tokenId = firstPos.tokenId;
    console.log('\n   🔍 TESTING getMarketResolution(tokenId)...');
    console.log(`   Token ID: ${tokenId.substring(0, 30)}...`);
    console.log(`   API URL: https://gamma-api.polymarket.com/markets?clob_token_ids=${tokenId.substring(0, 30)}...`);

    try {
      const resolution = await adapter.getMarketResolution(tokenId);

      console.log('\n   📋 RESOLUTION RESULT:');
      console.log(`   ├─ Resolved: ${resolution.resolved ? '✅ YES' : '❌ NO'}`);

      if (resolution.resolved) {
        console.log(`   ├─ Winning Outcome: ${resolution.winningOutcome?.toUpperCase()}`);
        console.log(`   └─ Resolution Date: ${resolution.resolutionDate}`);

        // Check if user has a winning position
        const winningPos = marketPositions.find(p => p.outcomeId === resolution.winningOutcome);
        if (winningPos) {
          const winningShares = parseFloat(winningPos.size);
          const potentialPayout = winningShares * 1.0; // $1 per share
          console.log(`\n   💰 YOU HAVE A WINNING POSITION!`);
          console.log(`   ├─ ${resolution.winningOutcome?.toUpperCase()} shares: ${winningShares}`);
          console.log(`   └─ Potential payout: $${potentialPayout.toFixed(2)}`);
        }
      } else {
        console.log(`   └─ Market is still OPEN - cannot redeem yet`);
      }
    } catch (error) {
      console.log(`   ❌ Error checking resolution: ${error}`);
    }
  }

  // 6. Test the raw Gamma API directly for comparison
  console.log('\n' + '=' .repeat(70));
  console.log('\n🔬 RAW API VERIFICATION\n');

  for (const [marketId, marketPositions] of marketGroups.entries()) {
    console.log(`Testing API for condition ID: ${marketId.substring(0, 20)}...`);
    const tokenId = marketPositions[0].tokenId; // Get the CLOB token ID

    // Test different URL formats
    const url1 = `https://gamma-api.polymarket.com/markets?condition_id=${marketId}`;
    const url2 = `https://gamma-api.polymarket.com/markets/${marketId}`;
    const url3 = `https://gamma-api.polymarket.com/markets?clob_token_ids=${tokenId}`;

    console.log(`\n1️⃣  condition_id URL: ${url1.substring(0, 80)}...`);
    try {
      const res1 = await fetch(url1);
      const data1 = await res1.json() as Array<{ question?: string; closed?: boolean; outcome?: string; neg_risk?: boolean; condition_id?: string }>;
      console.log(`   Status: ${res1.status}`);
      console.log(`   Response type: ${Array.isArray(data1) ? 'Array' : 'Object'}`);
      console.log(`   Data count: ${Array.isArray(data1) ? data1.length : 1}`);

      if (Array.isArray(data1) && data1.length > 0) {
        // Find exact match by condition_id
        const exactMatch = data1.find(m => m.condition_id === marketId);
        if (exactMatch) {
          console.log(`   ✅ EXACT MATCH FOUND!`);
          console.log(`   Market: ${exactMatch.question?.substring(0, 50) || 'N/A'}...`);
          console.log(`   Closed: ${exactMatch.closed}`);
          console.log(`   Outcome: ${exactMatch.outcome || 'N/A (not resolved)'}`);
        } else {
          console.log(`   ⚠️ No exact match - first result:`);
          const market = data1[0];
          console.log(`   Market: ${market.question?.substring(0, 50) || 'N/A'}...`);
          console.log(`   Condition ID: ${market.condition_id?.substring(0, 20)}...`);
        }
      }
    } catch (e) {
      console.log(`   ❌ Error: ${e}`);
    }

    console.log(`\n2️⃣  Direct path URL: ${url2.substring(0, 80)}...`);
    try {
      const res2 = await fetch(url2);
      console.log(`   Status: ${res2.status} ${res2.status === 422 ? '(Expected - condition IDs need query param)' : ''}`);
    } catch (e) {
      console.log(`   ❌ Error: ${e}`);
    }

    console.log(`\n3️⃣  clob_token_ids URL (using tokenId: ${tokenId.substring(0, 20)}...):`);
    console.log(`   ${url3.substring(0, 90)}...`);
    try {
      const res3 = await fetch(url3);
      const data3 = await res3.json() as Array<{
        id?: string;
        question?: string;
        closed?: boolean;
        outcome?: string;
        neg_risk?: boolean;
        condition_id?: string;
        tokens?: Array<{ token_id?: string; outcome?: string }>;
      }>;
      console.log(`   Status: ${res3.status}`);
      console.log(`   Data count: ${Array.isArray(data3) ? data3.length : 1}`);

      if (Array.isArray(data3) && data3.length > 0) {
        const market = data3[0];
        // Note: Gamma API uses camelCase, not snake_case
        const marketWithCamelCase = market as unknown as {
          id?: string;
          question?: string;
          conditionId?: string;  // camelCase!
          closed?: boolean;
          outcome?: string;
          negRisk?: boolean;     // camelCase!
          tokens?: Array<{ token_id?: string; outcome?: string }>;
        };

        console.log(`\n   ✅ MARKET DATA FROM GAMMA API:`);
        console.log(`   ├─ Question: ${marketWithCamelCase.question?.substring(0, 50) || 'N/A'}...`);
        console.log(`   ├─ ID: ${marketWithCamelCase.id}`);
        console.log(`   ├─ ConditionId (camelCase): ${marketWithCamelCase.conditionId || '⚠️ MISSING!'}`);
        console.log(`   ├─ Closed: ${marketWithCamelCase.closed}`);
        console.log(`   ├─ Outcome: ${marketWithCamelCase.outcome || 'N/A (not resolved)'}`);
        console.log(`   ├─ NegRisk (camelCase): ${marketWithCamelCase.negRisk || false}`);

        // Check tokens array for additional info
        if (market.tokens && market.tokens.length > 0) {
          console.log(`   └─ Tokens: ${market.tokens.length}`);
          for (const token of market.tokens) {
            console.log(`      ├─ ${token.outcome}: ${token.token_id?.substring(0, 30)}...`);
          }
        }

        // Check all keys in the response
        console.log(`\n   📋 ALL FIELDS IN MARKET RESPONSE:`);
        const keys = Object.keys(market);
        console.log(`   ${keys.join(', ')}`);

        // This is the correct way to check!
        console.log(`\n   📌 THIS IS THE RECOMMENDED APPROACH - use clob_token_ids!`);

        // Verify we have conditionId for redemption
        if (!marketWithCamelCase.conditionId) {
          console.log(`\n   ⚠️ WARNING: No conditionId found! Redemption may fail.`);
          console.log(`   Using market.id as fallback: ${marketWithCamelCase.id}`);
        } else {
          console.log(`\n   ✅ conditionId available for redemption: ${marketWithCamelCase.conditionId.substring(0, 20)}...`);
        }
      }
    } catch (e) {
      console.log(`   ❌ Error: ${e}`);
    }
  }

  console.log('\n' + '=' .repeat(70));
  console.log('\n✅ VERIFICATION COMPLETE\n');
  console.log('SUMMARY:');
  console.log('- If "Resolved: NO", market is still open (cannot redeem)');
  console.log('- If "Resolved: YES", check if you have winning position');
  console.log('- Query param URL should return 200 with array');
  console.log('- Direct path URL should return 422 for condition IDs (expected)\n');
}

main().catch(console.error);
