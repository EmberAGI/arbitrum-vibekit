#!/usr/bin/env node

/**
 * Radiant Strategy Pack CLI
 * 
 * Command-line interface for executing Radiant strategies without writing code.
 * Supports wallet connection via private key and executes strategies with simple commands.
 * 
 * Usage:
 *   export PRIVATE_KEY=0x...
 *   radiant-strategy loop --token 0xUSDC --loops 5
 */

import { createWalletClient, http, createPublicClient } from 'viem';
import { arbitrum } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { radiantPlugin } from '../../../../onchain-actions-plugins/radiant/dist/src/index.js';
import { makeRadiantClient } from './radiantFromPlugin.js';

const COMMANDS = {
  loop: 'Execute leveraged looping strategy',
  shield: 'Execute health factor protection',
  compound: 'Execute rewards auto-compounder',
  status: 'Check current position status',
  help: 'Show this help message'
};

function showHelp() {
  console.log('\n🔷 Radiant Strategy Pack CLI\n');
  console.log('Usage: radiant-strategy <command> [options]\n');
  console.log('Commands:');
  Object.entries(COMMANDS).forEach(([cmd, desc]) => {
    console.log(`  ${cmd.padEnd(12)} ${desc}`);
  });
  console.log('\nExamples:');
  console.log('  radiant-strategy loop --token 0xUSDC --loops 5 --hf 1.35');
  console.log('  radiant-strategy shield --token 0xUSDC --warn 1.35 --exit 1.20');
  console.log('  radiant-strategy compound --target 0xUSDC --min 10');
  console.log('  radiant-strategy status\n');
  console.log('Environment Variables:');
  console.log('  PRIVATE_KEY    Your wallet private key (required)');
  console.log('  RPC_URL        Arbitrum RPC URL (optional)\n');
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === 'help') {
    showHelp();
    process.exit(0);
  }

  // Validate private key
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error('❌ Error: PRIVATE_KEY environment variable not set');
    console.log('Set it with: export PRIVATE_KEY=0x...\n');
    process.exit(1);
  }

  if (!privateKey.startsWith('0x') || privateKey.length !== 66) {
    console.error('❌ Error: Invalid private key format. Must be 64 hex characters with 0x prefix');
    process.exit(1);
  }

  try {
    // Setup wallet with error handling
    const account = privateKeyToAccount(privateKey as `0x${string}`);
    const rpcUrl = process.env.RPC_URL || 'https://arb1.arbitrum.io/rpc';
    
    const walletClient = createWalletClient({
      account,
      chain: arbitrum,
      transport: http(rpcUrl)
    });

    const publicClient = createPublicClient({
      chain: arbitrum,
      transport: http(rpcUrl)
    });

    console.log(`\n🔗 Connected: ${account.address}`);
    console.log(`📡 Network: Arbitrum One\n`);

    // Create transaction executor with comprehensive error handling
    const executor = async (tx: { to: string; data: string; value: string | null }) => {
      try {
        console.log(`📤 Preparing transaction to ${tx.to}...`);
        
        const hash = await walletClient.sendTransaction({
          to: tx.to as `0x${string}`,
          data: tx.data as `0x${string}`,
          value: tx.value ? BigInt(tx.value) : 0n
        });
        console.log(`📝 Transaction sent: ${hash}`);
        
        // Wait for confirmation with timeout
        const receipt = await publicClient.waitForTransactionReceipt({ 
          hash,
          timeout: 60_000 // 60 second timeout
        });
        
        if (receipt.status === 'success') {
          console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);
        } else {
          throw new Error('Transaction failed');
        }
      } catch (error: any) {
        console.error(`❌ Transaction failed: ${error.message}`);
        throw error;
      }
    };

    // Create Radiant client with error handling
    let radiantClient;
    try {
      radiantClient = makeRadiantClient(radiantPlugin, account.address, executor);
    } catch (error: any) {
      console.error(`❌ Failed to initialize Radiant client: ${error.message}`);
      process.exit(1);
    }

    // Parse command line arguments
    const getArg = (flag: string, defaultValue?: string) => {
      const index = args.indexOf(flag);
      return index !== -1 ? args[index + 1] : defaultValue;
    };

    // Validate token address format
    const validateTokenAddress = (token: string): boolean => {
      return /^0x[a-fA-F0-9]{40}$/.test(token);
    };

    // Execute commands with comprehensive error handling
    switch (command) {
      case 'status': {
        console.log('📊 Checking position status...\n');
        
        try {
          const [position, markets] = await Promise.all([
            radiantPlugin.actions.getUserPosition(account.address),
            radiantPlugin.actions.fetchMarkets()
          ]);
          
          console.log('Position Summary:');
          console.log(`  Health Factor: ${position.healthFactor || 'N/A'}`);
          console.log(`  Total Collateral: $${position.totalCollateralUSD || '0'}`);
          console.log(`  Total Debt: $${position.totalDebtUSD || '0'}`);
          console.log(`  Available Borrows: $${position.availableBorrowsUSD || '0'}\n`);
          
          console.log('Available Markets:');
          if (markets && markets.length > 0) {
            markets.forEach((market: any) => {
              console.log(`  ${market.symbol || 'Unknown'}: Supply ${market.supplyAPR || '0'}% | Borrow ${market.borrowAPR || '0'}%`);
            });
          } else {
            console.log('  No markets available');
          }
          console.log();
        } catch (error: any) {
          console.error(`❌ Failed to fetch position data: ${error.message}`);
          process.exit(1);
        }
        break;
      }

      case 'loop': {
        const token = getArg('--token');
        const maxLoops = parseInt(getArg('--loops', '5') || '5');
        const minHealthFactor = parseFloat(getArg('--hf', '1.35') || '1.35');
        const utilizationBps = parseInt(getArg('--util', '9000') || '9000');

        // Validate inputs
        if (!token) {
          console.error('❌ Error: --token is required');
          process.exit(1);
        }
        if (!validateTokenAddress(token)) {
          console.error('❌ Error: Invalid token address format');
          process.exit(1);
        }
        if (maxLoops < 1 || maxLoops > 20) {
          console.error('❌ Error: --loops must be between 1 and 20');
          process.exit(1);
        }
        if (minHealthFactor < 1.1 || minHealthFactor > 5.0) {
          console.error('❌ Error: --hf must be between 1.1 and 5.0');
          process.exit(1);
        }
        if (utilizationBps < 1000 || utilizationBps > 9500) {
          console.error('❌ Error: --util must be between 1000 and 9500 (10% to 95%)');
          process.exit(1);
        }

        console.log('🔄 Executing Looping Strategy...');
        console.log(`   Token: ${token}`);
        console.log(`   Max Loops: ${maxLoops}`);
        console.log(`   Min Health Factor: ${minHealthFactor}`);
        console.log(`   Utilization: ${utilizationBps / 100}%\n`);

        try {
          const { LoopingStrategy } = await import('./strategies/looping.js');
          const strategy = new LoopingStrategy(radiantClient);
          
          await strategy.execute({
            token,
            maxLoops,
            minHealthFactor,
            utilizationBps
          });
          
          console.log('✅ Looping strategy completed!\n');
        } catch (error: any) {
          console.error(`❌ Looping strategy failed: ${error.message}`);
          process.exit(1);
        }
        break;
      }

      case 'shield': {
        const token = getArg('--token');
        const warnHF = parseFloat(getArg('--warn', '1.35') || '1.35');
        const softHF = parseFloat(getArg('--soft', '1.30') || '1.30');
        const hardHF = parseFloat(getArg('--hard', '1.25') || '1.25');
        const exitHF = parseFloat(getArg('--exit', '1.20') || '1.20');

        // Validate inputs
        if (!token) {
          console.error('❌ Error: --token is required');
          process.exit(1);
        }
        if (!validateTokenAddress(token)) {
          console.error('❌ Error: Invalid token address format');
          process.exit(1);
        }
        if (exitHF >= hardHF || hardHF >= softHF || softHF >= warnHF) {
          console.error('❌ Error: Thresholds must be in descending order: warn > soft > hard > exit');
          process.exit(1);
        }
        if (exitHF < 1.05) {
          console.error('❌ Error: Exit threshold too low, minimum 1.05');
          process.exit(1);
        }

        console.log('🛡️  Executing Health Factor Shield...');
        console.log(`   Token: ${token}`);
        console.log(`   Thresholds: Warn=${warnHF} Soft=${softHF} Hard=${hardHF} Exit=${exitHF}\n`);

        try {
          const { HealthFactorShield } = await import('./strategies/shield.js');
          const strategy = new HealthFactorShield(radiantClient);
          
          await strategy.execute({
            token,
            warnThreshold: warnHF,
            softThreshold: softHF,
            hardThreshold: hardHF,
            exitThreshold: exitHF
          });
          
          console.log('✅ Health factor shield completed!\n');
        } catch (error: any) {
          console.error(`❌ Health factor shield failed: ${error.message}`);
          process.exit(1);
        }
        break;
      }

      case 'compound': {
        const targetToken = getArg('--target');
        const minValueUSD = parseInt(getArg('--min', '10') || '10');

        // Validate inputs
        if (!targetToken) {
          console.error('❌ Error: --target is required');
          process.exit(1);
        }
        if (!validateTokenAddress(targetToken)) {
          console.error('❌ Error: Invalid target token address format');
          process.exit(1);
        }
        if (minValueUSD < 1 || minValueUSD > 1000) {
          console.error('❌ Error: --min must be between 1 and 1000 USD');
          process.exit(1);
        }

        console.log('💰 Executing Auto-Compounder...');
        console.log(`   Target Token: ${targetToken}`);
        console.log(`   Min Value: $${minValueUSD}\n`);

        try {
          const { AutoCompounder } = await import('./strategies/compound.js');
          const strategy = new AutoCompounder(radiantClient);
          
          await strategy.execute({
            targetToken,
            minValueUSD
          });
          
          console.log('✅ Auto-compounder completed!\n');
        } catch (error: any) {
          console.error(`❌ Auto-compounder failed: ${error.message}`);
          process.exit(1);
        }
        break;
      }

      default:
        console.error(`❌ Unknown command: ${command}`);
        showHelp();
        process.exit(1);
    }
  } catch (error: any) {
    console.error('\n❌ Fatal error:', error.message);
    if (error.code === 'NETWORK_ERROR') {
      console.log('💡 Try setting a different RPC_URL in your environment');
    }
    process.exit(1);
  }
}

// Handle uncaught errors gracefully
process.on('uncaughtException', (error) => {
  console.error('\n💥 Uncaught exception:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('\n💥 Unhandled rejection:', reason);
  process.exit(1);
});

main();
