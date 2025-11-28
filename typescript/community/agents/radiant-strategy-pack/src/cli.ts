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

const COMMANDS = {
  loop: 'Execute leveraged looping strategy',
  shield: 'Execute health factor protection',
  compound: 'Execute rewards auto-compounder',
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
  console.log('  radiant-strategy compound --target 0xUSDC --min 10\n');
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

  // Check private key
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error('❌ Error: PRIVATE_KEY environment variable not set');
    console.log('Set it with: export PRIVATE_KEY=0x...\n');
    process.exit(1);
  }

  // Setup wallet
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

  // Parse arguments
  const getArg = (flag: string, defaultValue?: string) => {
    const index = args.indexOf(flag);
    return index !== -1 ? args[index + 1] : defaultValue;
  };

  try {
    switch (command) {
      case 'loop': {
        const token = getArg('--token');
        const maxLoops = parseInt(getArg('--loops', '5') || '5');
        const minHealthFactor = parseFloat(getArg('--hf', '1.35') || '1.35');
        const utilizationBps = parseInt(getArg('--util', '9000') || '9000');

        if (!token) {
          console.error('❌ Error: --token is required');
          process.exit(1);
        }

        console.log('🔄 Executing Looping Strategy...');
        console.log(`   Token: ${token}`);
        console.log(`   Max Loops: ${maxLoops}`);
        console.log(`   Min Health Factor: ${minHealthFactor}`);
        console.log(`   Utilization: ${utilizationBps / 100}%\n`);

        console.log('✨ Strategy configured! (Execution requires full plugin integration)\n');
        break;
      }

      case 'shield': {
        const token = getArg('--token');
        const warnHF = parseFloat(getArg('--warn', '1.35') || '1.35');
        const softHF = parseFloat(getArg('--soft', '1.30') || '1.30');
        const hardHF = parseFloat(getArg('--hard', '1.25') || '1.25');
        const exitHF = parseFloat(getArg('--exit', '1.20') || '1.20');

        if (!token) {
          console.error('❌ Error: --token is required');
          process.exit(1);
        }

        console.log('🛡️  Executing Health Factor Shield...');
        console.log(`   Token: ${token}`);
        console.log(`   Thresholds: Warn=${warnHF} Soft=${softHF} Hard=${hardHF} Exit=${exitHF}\n`);

        console.log('✨ Strategy configured! (Execution requires full plugin integration)\n');
        break;
      }

      case 'compound': {
        const targetToken = getArg('--target');
        const minValueUSD = parseInt(getArg('--min', '10') || '10');

        if (!targetToken) {
          console.error('❌ Error: --target is required');
          process.exit(1);
        }

        console.log('💰 Executing Auto-Compounder...');
        console.log(`   Target Token: ${targetToken}`);
        console.log(`   Min Value: $${minValueUSD}\n`);

        console.log('✨ Strategy configured! (Execution requires full plugin integration)\n');
        break;
      }

      default:
        console.error(`❌ Unknown command: ${command}`);
        showHelp();
        process.exit(1);
    }
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();
