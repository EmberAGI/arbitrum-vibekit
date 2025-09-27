#!/usr/bin/env node

/**
 * Test script for Arbitrum Bridge Tools
 * 
 * This script tests all the refactored tools to ensure they work correctly
 * with the new EmberAGI-compatible architecture.
 */

import dotenv from 'dotenv';
import { tools } from './tools.js';

// Load environment variables
dotenv.config();

// Test configuration
const TEST_CONFIG = {
  // Test addresses (these are just examples, not real addresses)
  testRecipient: '0x742d35Cc6634C0532925a3b8D0C0C4C4C4C4C4C4',
  testTokenAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // USDC on Arbitrum
  testAmount: '1000000', // 1 USDC (6 decimals)
  testAmountEth: '1000000000000000000', // 1 ETH (18 decimals)
};

async function testTool(toolName: string, testFn: () => Promise<any>) {
  console.log(`\n🧪 Testing ${toolName}...`);
  try {
    const result = await testFn();
    console.log(`✅ ${toolName} passed`);
    console.log(`   Description: ${result.description}`);
    console.log(`   Chain ID: ${result.chainId}`);
    return result;
  } catch (error) {
    console.log(`❌ ${toolName} failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return null;
  }
}

async function runTests() {
  console.log('🚀 Starting Arbitrum Bridge Tools Tests');
  console.log('=====================================');
  
  // Test environment validation
  console.log('\n🔧 Environment Check...');
  try {
    if (!process.env.ARBITRUM_RPC_URL) {
      throw new Error('ARBITRUM_RPC_URL environment variable is required');
    }
    console.log('✅ Environment variables loaded');
  } catch (error) {
    console.log('❌ Environment check failed:', error instanceof Error ? error.message : 'Unknown error');
    console.log('Please set ARBITRUM_RPC_URL in your .env file');
    return;
  }
  
  // Test 1: List Available Routes
  await testTool('listAvailableRoutes', async () => {
    return await tools.listAvailableRoutes.execute({
      fromChainId: 1,
      toChainId: 42161,
      tokenAddress: TEST_CONFIG.testTokenAddress
    });
  });
  
  // Test 2: Estimate Bridge Gas
  await testTool('estimateBridgeGas', async () => {
    return await tools.estimateBridgeGas.execute({
      fromChainId: 1,
      toChainId: 42161,
      tokenAddress: TEST_CONFIG.testTokenAddress,
      amount: TEST_CONFIG.testAmount,
      recipient: TEST_CONFIG.testRecipient
    });
  });
  
  // Test 3: Bridge ETH to Arbitrum (transaction building)
  await testTool('bridgeEthToArbitrum', async () => {
    return await tools.bridgeEthToArbitrum.execute({
      amount: TEST_CONFIG.testAmountEth,
      recipient: TEST_CONFIG.testRecipient,
      userAddress: TEST_CONFIG.testRecipient,
      slippageBps: 100,
      deadlineMinutes: 30
    });
  });
  
  // Test 4: Bridge ERC20 to Arbitrum (transaction building)
  await testTool('bridgeErc20ToArbitrum', async () => {
    return await tools.bridgeErc20ToArbitrum.execute({
      tokenAddress: TEST_CONFIG.testTokenAddress,
      amount: TEST_CONFIG.testAmount,
      recipient: TEST_CONFIG.testRecipient,
      userAddress: TEST_CONFIG.testRecipient,
      slippageBps: 100,
      deadlineMinutes: 30
    });
  });
  
  // Test 5: Process Bridge Intent
  await testTool('processBridgeIntent', async () => {
    return await tools.processBridgeIntent.execute({
      intent: 'bridge 100 USDC from arbitrum to ethereum',
      userAddress: TEST_CONFIG.testRecipient,
      maxSlippageBps: 50,
      maxDeadlineMinutes: 20
    });
  });
  
  console.log('\n🎉 All tests completed!');
  console.log('\n📋 Tool Summary:');
  Object.keys(tools).forEach((toolName, index) => {
    console.log(`  ${index + 1}. ${toolName}: ${(tools as any)[toolName].description}`);
  });
  
  console.log('\n💡 Usage Example:');
  console.log('```typescript');
  console.log('import { tools } from "./index.js";');
  console.log('');
  console.log('// Bridge ETH to Arbitrum');
  console.log('const result = await tools.bridgeEthToArbitrum.execute({');
  console.log('  amount: "1000000000000000000", // 1 ETH in wei');
  console.log('  recipient: "0x742d35Cc6634C0532925a3b8D0C0C4C4C4C4C4C4"');
  console.log('});');
  console.log('```');
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(console.error);
}