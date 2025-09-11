/**
 * TriggerX Context Provider
 * Provides TriggerX client for user-initiated transactions
 */

import { TriggerXClient } from 'sdk-triggerx';
import type { TriggerXContext } from './types.js';

export const contextProvider = async (): Promise<TriggerXContext> => {
  console.log('🚀 TriggerX Context Provider initializing...');

  // Validate required environment variables
  console.log('🔍 Validating environment variables...');
  if (!process.env.NEXT_PUBLIC_TRIGGERX_API_KEY ) {
    console.error('❌ NEXT_PUBLIC_TRIGGERX_API_KEY  environment variable is missing');
    throw new Error('NEXT_PUBLIC_TRIGGERX_API_KEY  environment variable is required');
  } else {
    console.log('✅ NEXT_PUBLIC_TRIGGERX_API_KEY  found');
  }

  try {
    // Initialize TriggerX client with current SDK
    console.log('🔧 Initializing TriggerX Client...');
    
    // Set the API key in environment before creating the client
    // The SDK reads API key from process.env.API_KEY via getConfig()
    process.env.API_KEY = process.env.NEXT_PUBLIC_TRIGGERX_API_KEY ;
    
    // Create the client after setting the environment variable
    const triggerxClient = new TriggerXClient(process.env.NEXT_PUBLIC_TRIGGERX_API_KEY );
    
    // Also store the API key directly on the client for easier access
    (triggerxClient as any).apiKey = process.env.NEXT_PUBLIC_TRIGGERX_API_KEY ;
    
    console.log('✅ TriggerX Client initialized successfully', triggerxClient);

    // Parse supported chains
    console.log('⛓️ Parsing supported chains...');
    const supportedChains = process.env.SUPPORTED_CHAINS
      ? process.env.SUPPORTED_CHAINS.split(',').map((chain) => chain.trim())
      : ['421614']; // Default to Arbitrum Sepolia
    console.log('✅ Supported chains:', supportedChains);

    const context: TriggerXContext = {
      triggerxClient,
      supportedChains,
    };

    console.log('🎉 TriggerX Context Provider initialized successfully!');
    console.log('📊 Context summary:', {
      supportedChainsCount: supportedChains.length,
      userWalletIntegration: 'enabled',
    });

    return context;
  } catch (error) {
    console.error('💥 TriggerX Context Provider initialization failed:', error);
    throw error;
  }
};
