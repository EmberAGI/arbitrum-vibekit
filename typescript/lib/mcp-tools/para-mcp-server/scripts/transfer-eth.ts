#!/usr/bin/env tsx
/**
 * Example script to transfer ETH from a pregenerated wallet
 * 
 * Usage:
 *   pnpm tsx scripts/transfer-eth.ts <identifier> <recipientAddress> <amountInEth> [network] [identifierType]
 * 
 * Examples:
 *   pnpm tsx scripts/transfer-eth.ts panda@gmail.com 0x742d35Cc6634C0532925a3b844Bc454e4438f44e 0.001
 *   pnpm tsx scripts/transfer-eth.ts panda@gmail.com 0x742d35Cc6634C0532925a3b844Bc454e4438f44e 0.00001 base-sepolia
 *   pnpm tsx scripts/transfer-eth.ts panda@gmail.com 0x742d35Cc6634C0532925a3b844Bc454e4438f44e 0.005 base-sepolia email
 */

import 'dotenv/config';
import { transferEthTool } from '../src/tools/transferEth.js';

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 3) {
    console.error('Usage: tsx scripts/transfer-eth.ts <identifier> <recipientAddress> <amountInEth> [network] [identifierType]');
    console.error('');
    console.error('Examples:');
    console.error('  tsx scripts/transfer-eth.ts panda@gmail.com 0x742d35Cc6634C0532925a3b844Bc454e4438f44e 0.001');
    console.error('  tsx scripts/transfer-eth.ts panda@gmail.com 0x742d35Cc6634C0532925a3b844Bc454e4438f44e 0.00001 base-sepolia');
    console.error('  tsx scripts/transfer-eth.ts user@example.com 0x1234...abcd 0.005 arbitrum-sepolia email');
    console.error('');
    console.error('Amount should be in ETH (e.g., 0.001 for 0.001 ETH, 0.00001 for 0.00001 ETH)');
    process.exit(1);
  }

  const [identifier, recipientAddress, amount, network = 'base-sepolia', identifierType = 'email'] = args;

  console.log('🔄 Transferring ETH...');
  console.log(`   Identifier: ${identifier} (${identifierType})`);
  console.log(`   Recipient: ${recipientAddress}`);
  console.log(`   Amount: ${amount} ETH`);
  console.log(`   Network: ${network}`);
  console.log('');

  try {
    const result = await transferEthTool.execute(
      {
        identifier,
        identifierType: identifierType as 'email' | 'phone' | 'username' | 'id' | 'custom',
        recipientAddress,
        amount,
        network: network as 'base-sepolia' | 'ethereum-sepolia' | 'ethereum-holesky' | 'arbitrum-sepolia',
      },
      { custom: {} }
    );

    console.log('✅ Transfer completed!');
    console.log('');
    
    // Parse the artifact text to get the response
    if (result.artifacts && result.artifacts.length > 0) {
      const artifact = result.artifacts[0];
      if (artifact.parts && artifact.parts.length > 0 && artifact.parts[0].kind === 'text') {
        const responseData = JSON.parse(artifact.parts[0].text);
        
        if (responseData.success) {
          console.log('📊 Transaction Details:');
          console.log(`   Transaction Hash: ${responseData.transactionHash}`);
          console.log(`   From: ${responseData.from}`);
          console.log(`   To: ${responseData.to}`);
          console.log(`   Amount: ${responseData.amountEth} ETH (${responseData.amountWei} wei)`);
          console.log(`   Chain ID: ${responseData.chainId}`);
          console.log(`   Network: ${responseData.network}`);
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
    console.error('❌ Error during transfer:', error);
    if (error instanceof Error) {
      console.error('   Message:', error.message);
      console.error('   Stack:', error.stack);
    }
    process.exit(1);
  }
}

main();

