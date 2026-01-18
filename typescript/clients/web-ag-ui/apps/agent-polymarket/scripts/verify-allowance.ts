/**
 * Verify USDC.e Allowance Script
 *
 * This script verifies that the USDC.e allowance query to CTF Exchange is working correctly.
 * It checks the allowance for a given wallet address and displays the result.
 *
 * Usage:
 *   pnpm tsx scripts/verify-allowance.ts [walletAddress]
 *
 * If no wallet address is provided, it will use a default test address or prompt.
 */

import { ethers } from 'ethers';
import { POLYGON_CONTRACTS, CONTRACT_ABIS } from '../src/constants/contracts.js';

// Extended ABI for full USDC info
const USDC_EXTENDED_ABI = [
  ...CONTRACT_ABIS.USDC,
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
];

// Fallback RPC URLs for Polygon Mainnet
const POLYGON_RPC_URLS = [
  'https://polygon-rpc.com',
  'https://rpc-mainnet.matic.quiknode.pro',
  'https://polygon.llamarpc.com',
  'https://polygon-bor-rpc.publicnode.com',
];

async function getWorkingProvider(): Promise<ethers.JsonRpcProvider> {
  const customRpc = process.env.POLYGON_RPC_URL;
  const rpcsToTry = customRpc ? [customRpc, ...POLYGON_RPC_URLS] : POLYGON_RPC_URLS;

  for (const rpcUrl of rpcsToTry) {
    try {
      console.log(`📡 Trying RPC: ${rpcUrl}`);
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      // Test the connection
      await provider.getNetwork();
      console.log(`✅ Connected to: ${rpcUrl}`);
      return provider;
    } catch {
      console.log(`❌ Failed: ${rpcUrl}`);
    }
  }
  throw new Error('All RPC endpoints failed');
}

async function verifyAllowance(walletAddress: string) {
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('                    USDC.e Allowance Verification');
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log();

  const provider = await getWorkingProvider();
  console.log();

  // Verify connection
  try {
    const network = await provider.getNetwork();
    console.log('🔗 Connected to network:', network.name, `(Chain ID: ${network.chainId})`);
    if (network.chainId !== 137n) {
      console.warn('⚠️  Warning: Not connected to Polygon Mainnet (expected chain ID 137)');
    }
  } catch (error) {
    console.error('❌ Failed to connect to RPC:', error);
    process.exit(1);
  }

  console.log();
  console.log('📋 Contract Addresses:');
  console.log('   USDC.e Token:  ', POLYGON_CONTRACTS.USDC_E);
  console.log('   CTF Exchange:  ', POLYGON_CONTRACTS.CTF_EXCHANGE);
  console.log('   CTF Contract:  ', POLYGON_CONTRACTS.CTF_CONTRACT);
  console.log();

  // Create contract instances
  const usdcContract = new ethers.Contract(
    POLYGON_CONTRACTS.USDC_E,
    USDC_EXTENDED_ABI,
    provider,
  );

  const ctfContract = new ethers.Contract(
    POLYGON_CONTRACTS.CTF_CONTRACT,
    CONTRACT_ABIS.CTF_CONTRACT,
    provider,
  );

  // Verify USDC.e token info
  console.log('🪙 USDC.e Token Info:');
  try {
    const name = await usdcContract.name();
    const symbol = await usdcContract.symbol();
    const decimals = await usdcContract.decimals();
    console.log(`   Name:     ${name}`);
    console.log(`   Symbol:   ${symbol}`);
    console.log(`   Decimals: ${decimals}`);
  } catch (error) {
    console.error('   ❌ Failed to fetch token info:', error);
  }

  console.log();
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('👤 Wallet Address:', walletAddress);
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log();

  // Check USDC.e balance
  console.log('💰 USDC.e Balance:');
  try {
    const balanceRaw = await usdcContract.balanceOf(walletAddress);
    const balance = parseFloat(ethers.formatUnits(balanceRaw, 6));
    console.log(`   Raw:       ${balanceRaw.toString()}`);
    console.log(`   Formatted: $${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`);
  } catch (error) {
    console.error('   ❌ Failed to fetch balance:', error);
  }

  // Check USDC.e allowance to CTF Exchange
  console.log();
  console.log('📝 USDC.e Allowance to CTF Exchange:');
  try {
    const allowanceRaw = await usdcContract.allowance(walletAddress, POLYGON_CONTRACTS.CTF_EXCHANGE);
    const allowance = parseFloat(ethers.formatUnits(allowanceRaw, 6));

    console.log(`   Raw:       ${allowanceRaw.toString()}`);
    console.log(`   Formatted: $${allowance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`);

    // Check if it's unlimited (MaxUint256 or very high)
    const maxUint256 = ethers.MaxUint256;
    if (allowanceRaw === maxUint256) {
      console.log('   Status:    ✅ Unlimited approval');
    } else if (allowanceRaw === 0n) {
      console.log('   Status:    ❌ No approval (0)');
    } else if (allowance > 1_000_000_000) {
      console.log('   Status:    ✅ Very high approval (effectively unlimited)');
    } else {
      console.log(`   Status:    ⚠️  Limited approval ($${allowance.toLocaleString()})`);
    }
  } catch (error) {
    console.error('   ❌ Failed to fetch allowance:', error);
  }

  // Check CTF approval (ERC-1155)
  console.log();
  console.log('🎯 CTF Contract Approval (ERC-1155):');
  try {
    const ctfApproved = await ctfContract.isApprovedForAll(walletAddress, POLYGON_CONTRACTS.CTF_EXCHANGE);
    console.log(`   Approved for CTF Exchange: ${ctfApproved ? '✅ Yes' : '❌ No'}`);
  } catch (error) {
    console.error('   ❌ Failed to check CTF approval:', error);
  }

  // Check POL balance
  console.log();
  console.log('⛽ POL Balance (for gas):');
  try {
    const polBalanceWei = await provider.getBalance(walletAddress);
    const polBalance = parseFloat(ethers.formatEther(polBalanceWei));
    console.log(`   ${polBalance.toFixed(6)} POL`);
    if (polBalance < 0.01) {
      console.log('   ⚠️  Low balance - may not be enough for gas fees');
    }
  } catch (error) {
    console.error('   ❌ Failed to fetch POL balance:', error);
  }

  console.log();
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('                         Verification Complete');
  console.log('═══════════════════════════════════════════════════════════════════════');
}

// Main entry point
const walletAddress = process.argv[2];

if (!walletAddress) {
  console.log('Usage: pnpm tsx scripts/verify-allowance.ts <walletAddress>');
  console.log();
  console.log('Example:');
  console.log('  pnpm tsx scripts/verify-allowance.ts 0x1234567890abcdef1234567890abcdef12345678');
  console.log();

  // Use a sample Polymarket whale address for demo
  const sampleAddress = '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199';
  console.log(`Running with sample address: ${sampleAddress}`);
  console.log();

  verifyAllowance(sampleAddress).catch(console.error);
} else {
  // Validate address format
  if (!ethers.isAddress(walletAddress)) {
    console.error('❌ Invalid Ethereum address format:', walletAddress);
    process.exit(1);
  }

  verifyAllowance(walletAddress).catch(console.error);
}
