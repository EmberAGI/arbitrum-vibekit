#!/usr/bin/env tsx

/**
 * Script to create a Para pregenerated wallet using an email address
 * Usage: pnpm pregen:create <email>
 * Example: pnpm pregen:create user@example.com
 */

import 'dotenv/config';
import { createPregenWalletTool } from '../src/tools/createPregenWallet.js';

async function main() {
  const email = process.argv[2];

  if (!email) {
    console.error('❌ Error: Email address is required');
    console.log('\nUsage: pnpm pregen:create <email>');
    console.log('Example: pnpm pregen:create user@example.com');
    process.exit(1);
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    console.error('❌ Error: Invalid email format');
    console.log(`Provided: ${email}`);
    process.exit(1);
  }

  console.log('🔄 Creating pregenerated wallet...');
  console.log(`📧 Email: ${email}\n`);

  try {
    const result = await createPregenWalletTool.execute(
      { email },
      { custom: {} }
    );

    console.log('✅ Wallet operation completed!');
    console.log('');

    // Parse the artifact to get wallet details
    if (result.artifacts && result.artifacts.length > 0) {
      const artifact = result.artifacts[0];
      if (artifact.parts && artifact.parts.length > 0 && artifact.parts[0].kind === 'text') {
        const walletData = JSON.parse(artifact.parts[0].text);
        
        console.log('📄 Wallet Details:');
        console.log(JSON.stringify(walletData, null, 2));
        console.log('');
        
        if (walletData.walletId) {
          console.log('💡 Wallet ID:', walletData.walletId);
        }
        if (walletData.address) {
          console.log('💡 Address:', walletData.address);
        }
        if (walletData.email) {
          console.log('💡 Email:', walletData.email);
        }
      }
    }

  } catch (error) {
    console.error('❌ Failed to create pregenerated wallet:');
    if (error instanceof Error) {
      console.error(`   ${error.message}`);
      if (error.stack) {
        console.error('   Stack:', error.stack);
      }
    } else {
      console.error('   Unknown error occurred');
    }
    process.exit(1);
  }
}

main();
