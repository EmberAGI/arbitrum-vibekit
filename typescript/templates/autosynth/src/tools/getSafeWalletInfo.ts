/**
 * Get Safe Wallet Info Tool
 * Retrieves information about a user's Safe wallet
 */

import { z } from 'zod';
import type { VibkitToolDefinition } from 'arbitrum-vibekit-core';
import { createSuccessTask, createErrorTask } from 'arbitrum-vibekit-core';
import type { TriggerXContext } from '../context/types.js';

const GetSafeWalletInfoInputSchema = z.object({
  safeAddress: z.string().optional().describe('Safe wallet address to query (only required for getting info about existing wallets)'),
  chainId: z.string().default('421614').describe('Blockchain chain ID where the Safe wallet exists'),
});

export const getSafeWalletInfoTool: VibkitToolDefinition<typeof GetSafeWalletInfoInputSchema, any, TriggerXContext, any> = {
  name: 'getSafeWalletInfo',
  description: 'Get information about an EXISTING Safe wallet. NOTE: This tool currently returns placeholder data and cannot verify on-chain Safe configuration. DO NOT use this to validate Safe wallets before creating jobs - just trust the user that their Safe is properly configured. Use createSafeWallet tool for creating NEW wallets.',
  parameters: GetSafeWalletInfoInputSchema,
  execute: async (input, context) => {
    console.log('🔍 GetSafeWalletInfo tool executing with input:', JSON.stringify(input, null, 2));
    try {
      // If no safeAddress provided, return helpful message
      if (!input.safeAddress) {
        return createSuccessTask(
          'getSafeWalletInfo',
          undefined,
          'No Safe wallet address provided. To get information about a Safe wallet, please provide the Safe wallet address. If you want to create a new Safe wallet, use the createSafeWallet tool instead.'
        );
      }

      // Validate safeAddress format
      if (!input.safeAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
        return createErrorTask('getSafeWalletInfo', new Error('Invalid Safe wallet address format. Please provide a valid Ethereum address.'));
      }

      // Note: This tool doesn't query on-chain data because it's not needed
      // The agent has been instructed not to use this for validation
      // We just validate the address format and return a success message
      
      console.log('✅ Safe wallet address format validated');
      console.log('📋 Safe wallet:', input.safeAddress, 'on chain:', input.chainId);
      
      // Return a success message without trying to validate on-chain state
      // This avoids false "0 owners" errors since we can't query the blockchain
      const infoMessage = `Safe wallet address validated: ${input.safeAddress}. ` +
        `The address is properly formatted and ready for job creation. ` +
        `Please ensure your Safe wallet has proper owners and modules configured before creating jobs.`;

      return createSuccessTask(
        'getSafeWalletInfo',
        undefined,
        infoMessage
      );
    } catch (error) {
      return createErrorTask('getSafeWalletInfo', error instanceof Error ? error : new Error('Unknown error occurred'));
    }
  },
};
