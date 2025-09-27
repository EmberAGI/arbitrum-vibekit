#!/usr/bin/env node

/**
 * Demo script for Arbitrum Bridge Tools
 * 
 * This script demonstrates how to use the refactored tools
 * with the new EmberAGI-compatible architecture.
 */

import dotenv from 'dotenv';
import { tools } from './tools.js';

// Load environment variables
dotenv.config();

async function runDemo() {
  console.log('🌉 Arbitrum Bridge Tools Demo');
  console.log('============================');
  console.log('');
  
  // Demo 1: List available routes
  console.log('📋 Demo 1: Listing Available Routes');
  console.log('-----------------------------------');
  try {
    const routes = await tools.listAvailableRoutes.execute({
      fromChainId: 1,
      toChainId: 42161
    });
    console.log(`Found ${routes.totalRoutes} available routes:`);
    routes.routes.forEach((route: any, index: number) => {
      console.log(`  ${index + 1}. ${route.tokenSymbol} via ${route.protocol}`);
      console.log(`     Time: ${route.estimatedTime}, Cost: ${route.estimatedCost}`);
    });
  } catch (error) {
    console.log('❌ Error:', error instanceof Error ? error.message : 'Unknown error');
  }
  
  console.log('');
  
  // Demo 2: Estimate gas for a bridge transaction
  console.log('⛽ Demo 2: Gas Estimation');
  console.log('-------------------------');
  try {
    const gasEstimate = await tools.estimateBridgeGas.execute({
    fromChain: 'ethereum',
    toChain: 'arbitrum',
      tokenAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // USDC
      amount: '1000000' // 1 USDC
    });
    console.log(`Estimated gas: ${gasEstimate.estimatedGas}`);
    console.log(`Gas price: ${gasEstimate.gasPrice} wei`);
    console.log(`Estimated cost: ${gasEstimate.estimatedCost} wei`);
  } catch (error) {
    console.log('❌ Error:', error instanceof Error ? error.message : 'Unknown error');
  }
  
  console.log('');
  
  // Demo 3: Build a bridge transaction
  console.log('🔨 Demo 3: Building Bridge Transaction');
  console.log('-------------------------------------');
  try {
    const bridgeTx = await tools.bridgeEthToArbitrum.execute({
      amount: '1000000000000000000', // 1 ETH
      recipient: '0x742d35Cc6634C0532925a3b8D0C0C4C4C4C4C4C4',
      userAddress: '0x742d35Cc6634C0532925a3b8D0C0C4C4C4C4C4C4',
      slippageBps: 100,
      deadlineMinutes: 30
    });
    console.log('Bridge transaction built:');
    console.log(`  To: ${bridgeTx.transaction?.to}`);
    console.log(`  Value: ${bridgeTx.transaction?.value} wei`);
    console.log(`  Description: ${bridgeTx.description}`);
  } catch (error) {
    console.log('❌ Error:', error instanceof Error ? error.message : 'Unknown error');
  }
  
  console.log('');
  
  // Demo 4: Process natural language intent
  console.log('🗣️  Demo 4: Natural Language Intent Processing');
  console.log('----------------------------------------------');
  try {
    const intentResult = await tools.processBridgeIntent.execute({
      intent: 'bridge 100 USDC from arbitrum to ethereum',
      userAddress: '0x742d35Cc6634C0532925a3b8D0C0C4C4C4C4C4C4',
      maxSlippageBps: 50,
      maxDeadlineMinutes: 20
    });
    
    if (intentResult.parsed) {
      console.log('Intent parsed successfully:');
      console.log(`  Token: ${intentResult.parsed.token}`);
      console.log(`  Amount: ${intentResult.parsed.amount}`);
      console.log(`  From: Chain ${intentResult.parsed.fromChain}`);
      console.log(`  To: Chain ${intentResult.parsed.toChain}`);
      console.log(`  Priority: ${intentResult.parsed.priority}`);
    }
    
    if (intentResult.comparison && intentResult.comparison.length > 0) {
      console.log('\nProtocol comparison:');
      intentResult.comparison.forEach((comp: any, index: number) => {
        console.log(`  ${index + 1}. ${comp.protocol}: ${comp.estimatedTime}, ${comp.estimatedCost}`);
        if (comp.recommended) {
          console.log('     ⭐ Recommended');
        }
      });
    }
  } catch (error) {
    console.log('❌ Error:', error instanceof Error ? error.message : 'Unknown error');
  }
  
  console.log('');
  
  // Demo 5: List available routes
  console.log('🌟 Demo 5: List Available Routes');
  console.log('--------------------------------');
  try {
    const routes = await tools.listAvailableRoutes.execute({
      fromChainId: 1,
      toChainId: 42161
    });
    console.log(`Found ${routes.totalRoutes} available routes:`);
    routes.routes.forEach((route: any, index: number) => {
      console.log(`  ${index + 1}. ${route.tokenSymbol} via ${route.protocol}`);
      console.log(`     Time: ${route.estimatedTime}, Cost: ${route.estimatedCost}`);
    });
  } catch (error) {
    console.log('❌ Error:', error instanceof Error ? error.message : 'Unknown error');
  }
  
  console.log('');
  console.log('🎉 Demo completed!');
  console.log('');
  console.log('💡 Next Steps:');
  console.log('1. Set up your .env file with ARBITRUM_RPC_URL');
  console.log('2. Import the tools in your application');
  console.log('3. Use the tools to build bridge transactions');
  console.log('4. Integrate with EmberAGI or other AI systems');
}

// Run demo if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runDemo().catch(console.error);
}