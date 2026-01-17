/**
 * Test Approval Flow
 *
 * This script tests the approval checking logic to help debug why
 * approvals aren't being requested when hiring the agent.
 *
 * Usage:
 *   pnpm exec tsx scripts/test-approval-flow.ts
 */

import { ethers } from 'ethers';
import { checkApprovalStatus, buildApprovalTransactions } from '../src/clients/approvals.js';

async function testApprovalFlow() {
  console.log('\n🔍 Testing Approval Flow\n');
  console.log('=' .repeat(60));

  // Step 1: Get wallet address
  const privateKey = process.env.A2A_TEST_AGENT_NODE_PRIVATE_KEY;
  const explicitAddress = process.env.POLY_FUNDER_ADDRESS;

  let walletAddress: string | undefined;

  if (explicitAddress) {
    walletAddress = explicitAddress;
    console.log('✅ Using explicit wallet address from POLY_FUNDER_ADDRESS');
  } else if (privateKey) {
    try {
      const wallet = new ethers.Wallet(privateKey);
      walletAddress = wallet.address;
      console.log('✅ Derived wallet address from A2A_TEST_AGENT_NODE_PRIVATE_KEY');
    } catch (error) {
      console.error('❌ Failed to derive wallet from private key:', error);
      process.exit(1);
    }
  } else {
    console.error('❌ No wallet configuration found!');
    console.error('   Set either:');
    console.error('   - A2A_TEST_AGENT_NODE_PRIVATE_KEY=0x...');
    console.error('   - POLY_FUNDER_ADDRESS=0x...');
    process.exit(1);
  }

  console.log(`   Wallet: ${walletAddress}`);
  console.log('');

  // Step 2: Check RPC connection
  const rpcUrl = process.env.POLYGON_RPC_URL || 'https://polygon.llamarpc.com';
  console.log('🌐 Testing RPC connection...');
  console.log(`   RPC: ${rpcUrl}`);

  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const blockNumber = await provider.getBlockNumber();
    console.log(`✅ RPC connected - Block: ${blockNumber}`);
  } catch (error) {
    console.error('❌ RPC connection failed:', error);
    console.error('   Try setting POLYGON_RPC_URL to a different endpoint');
    process.exit(1);
  }
  console.log('');

  // Step 3: Check approval status
  console.log('🔐 Checking contract approvals...');

  const status = await checkApprovalStatus(walletAddress, rpcUrl);

  console.log(`   CTF Contract approved: ${status.ctfApproved ? '✅ YES' : '❌ NO'}`);
  console.log(`   USDC.e approved: ${status.usdcApproved ? '✅ YES' : '❌ NO'}`);
  console.log(`   POL balance: ${status.polBalance.toFixed(4)} POL`);
  console.log(`   USDC balance: $${status.usdcBalance.toFixed(2)}`);
  console.log(`   Needs approval: ${status.needsApproval ? '❌ YES' : '✅ NO'}`);
  console.log('');

  // Step 4: Check if approvals needed
  if (status.needsApproval) {
    console.log('⚠️  APPROVALS REQUIRED - Agent should interrupt and ask for signatures');
    console.log('');

    const txs = buildApprovalTransactions(status);
    console.log(`📝 Generated ${txs.length} approval transaction(s):`);
    txs.forEach((tx, i) => {
      console.log(`\n   Transaction ${i + 1}:`);
      console.log(`   - To: ${tx.to}`);
      console.log(`   - Description: ${tx.description}`);
      console.log(`   - Gas Limit: ${tx.gasLimit}`);
      console.log(`   - Data: ${tx.data.substring(0, 66)}...`);
    });
  } else {
    console.log('✅ All approvals verified - Agent should proceed to trading');
  }
  console.log('');

  // Step 5: Check balances
  console.log('💰 Balance checks:');

  const MIN_POL_BALANCE = 0.01;
  const MIN_USDC_BALANCE = 10;

  if (status.polBalance < MIN_POL_BALANCE) {
    console.log(`   ❌ Insufficient POL: ${status.polBalance.toFixed(4)} < ${MIN_POL_BALANCE}`);
    console.log(`      Fund wallet with POL for gas fees`);
  } else {
    console.log(`   ✅ Sufficient POL: ${status.polBalance.toFixed(4)} POL`);
  }

  if (status.usdcBalance < MIN_USDC_BALANCE) {
    console.log(`   ❌ Insufficient USDC: $${status.usdcBalance.toFixed(2)} < $${MIN_USDC_BALANCE}`);
    console.log(`      Fund wallet with USDC.e for trading`);
  } else {
    console.log(`   ✅ Sufficient USDC: $${status.usdcBalance.toFixed(2)}`);
  }
  console.log('');

  // Step 6: Summary
  console.log('=' .repeat(60));
  console.log('📊 Summary:\n');

  if (!status.needsApproval && status.polBalance >= MIN_POL_BALANCE && status.usdcBalance >= MIN_USDC_BALANCE) {
    console.log('✅ ALL CHECKS PASSED - Agent is ready to trade!');
    console.log('   The approval flow will be skipped.');
  } else {
    console.log('⚠️  CHECKS FAILED - Agent should interrupt with:');
    if (status.needsApproval) {
      console.log('   1. Approval request (CTF and/or USDC)');
    }
    if (status.polBalance < MIN_POL_BALANCE) {
      console.log('   2. POL funding request');
    }
    if (status.usdcBalance < MIN_USDC_BALANCE) {
      console.log('   3. USDC funding request');
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('\n💡 If the agent is NOT interrupting as expected:');
  console.log('   1. Check agent logs for "🔍 checkApprovals node reached"');
  console.log('   2. Verify wallet address matches what\'s shown above');
  console.log('   3. Check that lifecycleState transitions to "running"');
  console.log('   4. Ensure frontend is listening for pendingApprovalTransactions');
  console.log('');
}

testApprovalFlow().catch((error) => {
  console.error('\n❌ Test failed:', error);
  process.exit(1);
});
