/**
 * TriggerX Context Provider
 * Provides TriggerX client and blockchain signer
 */

import { ethers } from 'ethers';
import { TriggerXClient } from 'sdk-triggerx';
import type { TriggerXContext } from './types.js';

export const contextProvider = async (): Promise<TriggerXContext> => {
  console.log('🚀 TriggerX Context Provider initializing...');

  // Validate required environment variables
  console.log('🔍 Validating environment variables...');
  if (!process.env.TRIGGERX_API_KEY) {
    console.error('❌ TRIGGERX_API_KEY environment variable is missing');
    throw new Error('TRIGGERX_API_KEY environment variable is required');
  } else {
    console.log('✅ TRIGGERX_API_KEY found');
  }

  if (!process.env.RPC_URL) {
    console.error('❌ RPC_URL environment variable is missing');
    throw new Error('RPC_URL environment variable is required');
  } else {
    console.log('✅ RPC_URL found:', process.env.RPC_URL);
  }



  if (!process.env.PRIVATE_KEY) {
    console.error('❌ PRIVATE_KEY environment variable is missing');
    throw new Error('PRIVATE_KEY environment variable is required');
  } else {
    console.log('✅ PRIVATE_KEY found (length:', process.env.PRIVATE_KEY.length, 'chars)');
    // Debug: Check private key format (first few and last few chars only)
    const pk = process.env.PRIVATE_KEY;
    console.log('🔍 Private key format check:');
    console.log('   - Starts with 0x?', pk.startsWith('0x'));
    console.log('   - First 6 chars:', pk.substring(0, 6));
    console.log('   - Last 4 chars:', pk.substring(pk.length - 4));
    console.log('   - Length:', pk.length);
    console.log('   - Expected format: 0x + 64 hex chars (total 66 chars)');

    if (!pk.startsWith('0x')) {
      console.log('⚠️  Private key missing 0x prefix - will be added automatically');
    }
  }

  try {
    // Initialize TriggerX client with current SDK
    console.log('🔧 Initializing TriggerX Client...');
    
    // Set the API key in environment before creating the client
    // The SDK reads API key from process.env.API_KEY via getConfig()
    process.env.API_KEY = process.env.TRIGGERX_API_KEY;
    
    // Create the client after setting the environment variable
    const triggerxClient = new TriggerXClient(process.env.TRIGGERX_API_KEY);
    
    // Also store the API key directly on the client for easier access
    (triggerxClient as any).apiKey = process.env.TRIGGERX_API_KEY;
    
    console.log('✅ TriggerX Client initialized successfully', triggerxClient);

    // Initialize blockchain provider and signer
    console.log('🔗 Connecting to Arbitrum Sepolia provider (for Vibekit)...');
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    console.log('✅ Arbitrum provider connected');



    console.log('🔑 Creating wallet signer...');
    let signer: ethers.Wallet;
    let userAddress: string;

    try {
      // Ensure private key has 0x prefix
      const privateKey = process.env.PRIVATE_KEY.startsWith('0x')
        ? process.env.PRIVATE_KEY
        : '0x' + process.env.PRIVATE_KEY;
      console.log('privateKey', privateKey);
      console.log('🔧 Using private key with proper format (0x prefix added if needed)');
      signer = new ethers.Wallet(privateKey, provider);
      userAddress = await signer.getAddress();
      console.log('✅ Arbitrum wallet signer created. Address:', userAddress);


      console.log('🔍 Signer details:', {
        hasProvider: !!signer.provider,
        address: userAddress,
        privateKeyLength: signer.privateKey ? signer.privateKey.length : 'undefined',
      });
    } catch (signerError) {
      console.error('❌ Failed to create signer:', signerError);
      throw new Error(`Signer creation failed: ${signerError}`);
    }

    // Check network connection
    console.log('🌐 Checking network connection...');
    try {
      const network = await provider.getNetwork();
      console.log('✅ Network connected:', {
        name: network.name,
        chainId: network.chainId.toString(),
      });
    } catch (networkError) {
      console.warn('⚠️ Network connection warning:', networkError);
    }

    // Parse supported chains
    console.log('⛓️ Parsing supported chains...');
    const supportedChains = process.env.SUPPORTED_CHAINS
      ? process.env.SUPPORTED_CHAINS.split(',').map((chain) => chain.trim())
      : ['421614']; // Default to Arbitrum Sepolia
    console.log('✅ Supported chains:', supportedChains);

    const context: TriggerXContext = {
      triggerxClient,
      signer,
      userAddress,
      supportedChains,
    };

    console.log('🎉 TriggerX Context Provider initialized successfully!');
    console.log('📊 Context summary:', {
      userAddress,
      supportedChainsCount: supportedChains.length,
      rpcUrl: process.env.RPC_URL,
    });

    return context;
  } catch (error) {
    console.error('💥 TriggerX Context Provider initialization failed:', error);
    throw error;
  }
};
