#!/usr/bin/env tsx
/**
 * Example script to check ETH balance of an Ethereum address
 * 
 * Usage:
 *   pnpm tsx scripts/check-balance.ts <address> [network]
 * 
 * Examples:
 *   pnpm tsx scripts/check-balance.ts 0x742d35Cc6634C0532925a3b844Bc454e4438f44e
 *   pnpm tsx scripts/check-balance.ts 0x742d35Cc6634C0532925a3b844Bc454e4438f44e base-sepolia
 *   pnpm tsx scripts/check-balance.ts 0x742d35Cc6634C0532925a3b844Bc454e4438f44e arbitrum-sepolia
 */

import 'dotenv/config';
import { checkBalanceTool } from '../src/tools/checkBalance.js';

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.error('Usage: tsx scripts/check-balance.ts <address> [network]');
    console.error('');
    console.error('Examples:');
    console.error('  tsx scripts/check-balance.ts 0x742d35Cc6634C0532925a3b844Bc454e4438f44e');
    console.error('  tsx scripts/check-balance.ts 0x742d35Cc6634C0532925a3b844Bc454e4438f44e base-sepolia');
    console.error('  tsx scripts/check-balance.ts 0x742d35Cc6634C0532925a3b844Bc454e4438f44e arbitrum-sepolia');
    console.error('');
    console.error('Supported networks: base-sepolia, ethereum-sepolia, ethereum-holesky, arbitrum-sepolia');
    process.exit(1);
  }

  const [address, network = 'base-sepolia'] = args;

  console.log('🔍 Checking ETH balance...');
  console.log(`   Address: ${address}`);
  console.log(`   Network: ${network}`);
  console.log('');

  try {
    const result = await checkBalanceTool.execute(
      {
        address,
        network: network as 'base-sepolia' | 'ethereum-sepolia' | 'ethereum-holesky' | 'arbitrum-sepolia',
      },
      { custom: {} }
    );

    console.log('✅ Balance retrieved!');
    console.log('');
    
    // Parse the artifact text to get the response
    if (result.artifacts && result.artifacts.length > 0) {
      const artifact = result.artifacts[0];
      if (artifact.parts && artifact.parts.length > 0 && artifact.parts[0].kind === 'text') {
        const responseData = JSON.parse(artifact.parts[0].text);
        
        if (responseData.success) {
          console.log('💰 Balance Information:');
          console.log(`   Address: ${responseData.address}`);
          console.log(`   Balance: ${responseData.balanceEth} ETH`);
          console.log(`   Balance (Wei): ${responseData.balanceWei} wei`);
          console.log(`   Network: ${responseData.network}`);
          console.log(`   Chain ID: ${responseData.chainId}`);
          console.log(`   Block Number: ${responseData.blockNumber}`);
          console.log(`   Explorer: ${responseData.explorerLink}`);
          console.log('');
          console.log('💡 Note:', responseData.note);
        } else if (responseData.error) {
          console.error('❌ Error:', responseData.error);
          console.error('   Message:', responseData.message);
          if (responseData.code) {
            console.error('   Code:', responseData.code);
          }
        }
      }
    }
  } catch (error) {
    console.error('❌ Error checking balance:', error);
    if (error instanceof Error) {
      console.error('   Message:', error.message);
      console.error('   Stack:', error.stack);
    }
    process.exit(1);
  }
}

main();

