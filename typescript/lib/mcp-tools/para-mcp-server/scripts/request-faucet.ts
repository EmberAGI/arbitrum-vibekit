#!/usr/bin/env tsx
/**
 * Example script to request faucet funds using the Para MCP Server
 * 
 * Usage:
 *   tsx scripts/request-faucet.ts <address> [token] [network]
 * 
 * Examples:
 *   tsx scripts/request-faucet.ts 0x742d35Cc6634C0532925a3b844Bc454e4438f44e
 *   tsx scripts/request-faucet.ts 0x742d35Cc6634C0532925a3b844Bc454e4438f44e eth base-sepolia
 *   tsx scripts/request-faucet.ts 0x742d35Cc6634C0532925a3b844Bc454e4438f44e usdc ethereum-sepolia
 */

import dotenv from 'dotenv';
import { requestFaucetTool } from '../src/tools/requestFaucet.js';

dotenv.config();

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: tsx scripts/request-faucet.ts <address> [token] [network]');
    console.error('');
    console.error('Examples:');
    console.error('  tsx scripts/request-faucet.ts 0x742d35Cc6634C0532925a3b844Bc454e4438f44e');
    console.error('  tsx scripts/request-faucet.ts 0x742d35Cc6634C0532925a3b844Bc454e4438f44e eth base-sepolia');
    console.error('  tsx scripts/request-faucet.ts 0x742d35Cc6634C0532925a3b844Bc454e4438f44e usdc ethereum-sepolia');
    console.error('');
    console.error('Supported tokens: eth, usdc, eurc, cbbtc');
    console.error('Supported networks: base-sepolia, ethereum-sepolia, ethereum-holesky');
    process.exit(1);
  }

  const address = args[0];
  const token = (args[1] || 'eth') as 'eth' | 'usdc' | 'eurc' | 'cbbtc';
  const network = (args[2] || 'base-sepolia') as 'base-sepolia' | 'ethereum-sepolia' | 'ethereum-holesky';

  console.log(`Requesting ${token.toUpperCase()} faucet funds for ${address} on ${network}...`);
  console.log('');

  try {
    const result = await requestFaucetTool.execute(
      { address, token, network },
      { custom: {} as any }
    );

    console.log('Result:');
    console.log(JSON.stringify(result, null, 2));
    console.log('');

    // Extract and display the artifact content
    if (result.artifacts && result.artifacts.length > 0) {
      const firstArtifact = result.artifacts[0] as any;
      const firstPart = firstArtifact?.parts?.[0];
      const text = firstPart?.text;
      
      if (text) {
        try {
          const data = JSON.parse(text);
          console.log('Faucet Response:');
          console.log(JSON.stringify(data, null, 2));
          
          if (data.success && data.explorerLink) {
            console.log('');
            console.log(`✅ Success! View transaction: ${data.explorerLink}`);
          } else if (data.error) {
            console.log('');
            console.log(`❌ Error: ${data.message || data.error}`);
          }
        } catch (e) {
          console.log('Response text:', text);
        }
      }
    }
  } catch (error) {
    console.error('Error requesting faucet:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});

