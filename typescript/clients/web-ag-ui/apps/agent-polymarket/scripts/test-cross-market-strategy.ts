/**
 * Test Script: Cross-Market Arbitrage Strategy Validation
 *
 * This script tests the cross-market arbitrage detection and execution logic
 * using mock market data.
 *
 * Run with: tsx scripts/test-cross-market-strategy.ts
 */

import type { Market } from '../src/workflow/context.js';
import { detectMarketRelationships, checkPriceViolation } from '../src/strategy/relationshipDetector.js';
import { scanForCrossMarketOpportunities } from '../src/strategy/scanner.js';
import { calculateCrossMarketPositionSize, isCrossMarketPositionViable } from '../src/strategy/evaluator.js';
import { DEFAULT_STRATEGY_CONFIG } from '../src/workflow/context.js';
import type { ApprovalStatus } from '../src/clients/approvals.js';

// Helper function to create approval status for testing
function createApprovalStatus(usdcBalance: number, usdcAllowance: number): ApprovalStatus {
  return {
    ctfApproved: true,
    usdcApproved: true,
    polBalance: 1.0,
    usdcBalance,
    usdcAllowance,
    needsApproval: false,
  };
}

// ============================================================================
// Mock Market Data
// ============================================================================

const mockMarkets: Market[] = [
  // Example 1: IMPLIES relationship violation - Trump → Republican
  {
    id: 'market-1',
    title: 'Trump wins Florida',
    description: 'Will Donald Trump win the state of Florida?',
    yesTokenId: '0xtrump-fl-yes',
    noTokenId: '0xtrump-fl-no',
    yesPrice: 0.75, // Overpriced
    noPrice: 0.20,
    volume: 100000,
    liquidity: 50000,
    endDate: '2024-11-05T23:59:59Z',
    resolved: false,
    active: true,
  },
  {
    id: 'market-2',
    title: 'Republican wins Florida',
    description: 'Will the Republican candidate win Florida?',
    yesTokenId: '0xrep-fl-yes',
    noTokenId: '0xrep-fl-no',
    yesPrice: 0.72, // Underpriced (should be >= Trump price)
    noPrice: 0.25,
    volume: 150000,
    liquidity: 75000,
    endDate: '2024-11-05T23:59:59Z',
    resolved: false,
    active: true,
  },

  // Example 2: Time-based IMPLIES - Q1 → 2025
  {
    id: 'market-3',
    title: 'Bitcoin hits $100k in Q1 2025',
    description: 'Will Bitcoin reach $100,000 in Q1 2025?',
    yesTokenId: '0xbtc-q1-yes',
    noTokenId: '0xbtc-q1-no',
    yesPrice: 0.40,
    noPrice: 0.58,
    volume: 200000,
    liquidity: 100000,
    endDate: '2025-03-31T23:59:59Z',
    resolved: false,
    active: true,
  },
  {
    id: 'market-4',
    title: 'Bitcoin hits $100k in 2025',
    description: 'Will Bitcoin reach $100,000 anytime in 2025?',
    yesTokenId: '0xbtc-2025-yes',
    noTokenId: '0xbtc-2025-no',
    yesPrice: 0.35, // Should be >= Q1 price (violation!)
    noPrice: 0.63,
    volume: 250000,
    liquidity: 125000,
    endDate: '2025-12-31T23:59:59Z',
    resolved: false,
    active: true,
  },

  // Example 3: No relationship
  {
    id: 'market-5',
    title: 'Ethereum price above $5000 in 2025',
    description: 'Will ETH exceed $5,000?',
    yesTokenId: '0xeth-yes',
    noTokenId: '0xeth-no',
    yesPrice: 0.55,
    noPrice: 0.43,
    volume: 180000,
    liquidity: 90000,
    endDate: '2025-12-31T23:59:59Z',
    resolved: false,
    active: true,
  },
];

// ============================================================================
// Test Functions
// ============================================================================

async function testRelationshipDetection() {
  console.log('\n🔍 Testing Relationship Detection\n');
  console.log('='.repeat(60));

  const relationships = await detectMarketRelationships(mockMarkets, false);

  console.log(`\nDetected ${relationships.length} relationships:\n`);

  for (const rel of relationships) {
    console.log(`\n📊 Relationship Type: ${rel.type}`);
    console.log(`   Confidence: ${rel.confidence}`);
    console.log(`   Parent: ${rel.parentMarket.title}`);
    console.log(`   Child: ${rel.childMarket.title}`);
    console.log(`   Reasoning: ${rel.reasoning}`);
    console.log(`   Parent Price: $${rel.parentMarket.yesPrice.toFixed(2)}`);
    console.log(`   Child Price: $${rel.childMarket.yesPrice.toFixed(2)}`);

    // Check for violation
    const violation = checkPriceViolation(rel);
    if (violation) {
      console.log(`   ⚠️ VIOLATION DETECTED!`);
      console.log(`   Violation Type: ${violation.violation.type}`);
      console.log(`   Expected Profit: $${violation.expectedProfitPerShare.toFixed(3)} per share`);
    } else {
      console.log(`   ✓ No price violation`);
    }
  }

  return relationships;
}

async function testOpportunityScanning() {
  console.log('\n\n🎯 Testing Opportunity Scanning\n');
  console.log('='.repeat(60));

  const result = await scanForCrossMarketOpportunities(mockMarkets, DEFAULT_STRATEGY_CONFIG, false);

  console.log(`\nFound ${result.opportunities.length} cross-market opportunities:`);
  console.log(`Detected ${result.relationships.length} total relationships\n`);

  for (const opp of result.opportunities) {
    console.log(`\n💰 Opportunity #${result.opportunities.indexOf(opp) + 1}`);
    console.log(`   Type: ${opp.relationship.type}`);
    console.log(`   Parent: ${opp.relationship.parentMarket.title}`);
    console.log(`   Child: ${opp.relationship.childMarket.title}`);
    console.log(`   Violation: ${opp.violation.description}`);
    console.log(`   Expected Profit: $${opp.expectedProfitPerShare.toFixed(3)} per share`);
    console.log(`   Trade: SELL ${opp.relationship.parentMarket.title} @ $${opp.trades.sellMarket.price.toFixed(2)}`);
    console.log(`         BUY ${opp.relationship.childMarket.title} @ $${opp.trades.buyMarket.price.toFixed(2)}`);
  }

  return result.opportunities;
}

async function testPositionSizing() {
  console.log('\n\n💵 Testing Position Sizing\n');
  console.log('='.repeat(60));

  const result = await scanForCrossMarketOpportunities(mockMarkets, DEFAULT_STRATEGY_CONFIG, false);

  if (result.opportunities.length === 0) {
    console.log('\n⚠️ No opportunities found to test position sizing');
    return;
  }

  const usdcBalance = 10000; // $10,000 USDC balance
  const usdcAllowance = 10000; // $10,000 USDC approved
  const approvalStatus = createApprovalStatus(usdcBalance, usdcAllowance);

  console.log(`\nUSDC Balance: $${usdcBalance.toLocaleString()}`);
  console.log(`USDC Allowance: $${usdcAllowance.toLocaleString()}`);
  console.log(`Max position size: $${DEFAULT_STRATEGY_CONFIG.maxPositionSizeUsd}\n`);

  for (const opp of result.opportunities) {
    console.log(`\n📊 Position for: ${opp.relationship.parentMarket.title.substring(0, 40)}...`);

    const position = calculateCrossMarketPositionSize(opp, approvalStatus, DEFAULT_STRATEGY_CONFIG);

    if (!position) {
      console.log('   ❌ Position not viable');
      continue;
    }

    console.log(`   Shares: ${position.shares}`);
    console.log(`   Sell Revenue: $${position.sellRevenueUsd.toFixed(2)}`);
    console.log(`   Buy Cost: $${position.buyCostUsd.toFixed(2)}`);
    console.log(`   Net Cost: $${position.netCostUsd.toFixed(2)} ${position.netCostUsd < 0 ? '(collected premium!)' : ''}`);
    console.log(`   Expected Profit: $${position.expectedProfitUsd.toFixed(2)}`);
    console.log(`   ROI: ${position.roi === Infinity ? 'Infinite (collected premium upfront!)' : (position.roi * 100).toFixed(2) + '%'}`);
    console.log(`   Sell Slippage: ${(position.sellSlippage * 100).toFixed(2)}%`);
    console.log(`   Buy Slippage: ${(position.buySlippage * 100).toFixed(2)}%`);

    const viable = isCrossMarketPositionViable(position);
    console.log(`   ${viable ? '✓' : '❌'} Position ${viable ? 'IS' : 'NOT'} viable for execution`);
  }
}

async function testCompleteFlow() {
  console.log('\n\n🚀 Testing Complete Arbitrage Flow\n');
  console.log('='.repeat(60));

  // Step 1: Detect relationships
  const relationships = await detectMarketRelationships(mockMarkets, false);
  console.log(`\n1. Detected ${relationships.length} market relationships`);

  // Step 2: Find violations
  let violationCount = 0;
  for (const rel of relationships) {
    const violation = checkPriceViolation(rel);
    if (violation) violationCount++;
  }
  console.log(`2. Found ${violationCount} price violations`);

  // Step 3: Scan for opportunities
  const result = await scanForCrossMarketOpportunities(mockMarkets, DEFAULT_STRATEGY_CONFIG, false);
  console.log(`3. Filtered to ${result.opportunities.length} executable opportunities`);

  // Step 4: Calculate positions
  const usdcBalance = 10000;
  const usdcAllowance = 10000;
  const approvalStatus = createApprovalStatus(usdcBalance, usdcAllowance);
  const viablePositions: Array<{ opp: typeof result.opportunities[0]; pos: any }> = [];

  for (const opp of result.opportunities) {
    const pos = calculateCrossMarketPositionSize(opp, approvalStatus, DEFAULT_STRATEGY_CONFIG);
    if (pos && isCrossMarketPositionViable(pos)) {
      viablePositions.push({ opp, pos });
    }
  }

  console.log(`4. ${viablePositions.length} positions ready for execution\n`);

  // Step 5: Display execution plan
  if (viablePositions.length > 0) {
    console.log('\n📋 Execution Plan:\n');
    let totalExpectedProfit = 0;

    for (const { opp, pos } of viablePositions) {
      const num = viablePositions.indexOf({ opp, pos }) + 1;
      const oppositeOutcome = opp.trades.sellMarket.outcome === 'yes' ? 'NO' : 'YES';
      const oppositePrice = 1.0 - opp.trades.sellMarket.price;

      console.log(`\nTrade #${num}:`);
      console.log(`  1. BUY ${oppositeOutcome} ${pos.shares} shares of "${opp.relationship.parentMarket.title.substring(0, 40)}..."`);
      console.log(`     @ $${oppositePrice.toFixed(4)} = Cost $${pos.sellRevenueUsd.toFixed(2)}`);
      console.log(`  2. BUY ${opp.trades.buyMarket.outcome.toUpperCase()} ${pos.shares} shares of "${opp.relationship.childMarket.title.substring(0, 40)}..."`);
      console.log(`     @ $${opp.trades.buyMarket.price.toFixed(4)} = Cost $${pos.buyCostUsd.toFixed(2)}`);
      console.log(`  3. Total cost: $${pos.netCostUsd.toFixed(2)}`);
      console.log(`  4. Expected profit: $${pos.expectedProfitUsd.toFixed(2)} (ROI: ${(pos.roi * 100).toFixed(1)}%)`);

      totalExpectedProfit += pos.expectedProfitUsd;
    }

    console.log(`\n💰 Total Expected Profit: $${totalExpectedProfit.toFixed(2)}`);
    console.log(`📈 Available Capital ROI: ${((totalExpectedProfit / usdcBalance) * 100).toFixed(2)}%`);
  } else {
    console.log('\n⚠️ No viable positions to execute with current parameters');
  }
}

// ============================================================================
// Main Test Runner
// ============================================================================

async function main() {
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║   Cross-Market Arbitrage Strategy Test Suite             ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');

  try {
    await testRelationshipDetection();
    await testOpportunityScanning();
    await testPositionSizing();
    await testCompleteFlow();

    console.log('\n\n✅ All tests completed successfully!\n');
  } catch (error) {
    console.error('\n\n❌ Test failed with error:', error);
    process.exit(1);
  }
}

main();
