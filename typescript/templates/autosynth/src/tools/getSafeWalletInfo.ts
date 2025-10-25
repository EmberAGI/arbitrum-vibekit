/**
 * Get Safe Wallet Info Tool
 * Retrieves information about a user's Safe wallet
 */

import { z } from 'zod';
import type { VibkitToolDefinition } from 'arbitrum-vibekit-core';
import { createSuccessTask, createErrorTask } from 'arbitrum-vibekit-core';
import type { TriggerXContext } from '../context/types.js';
import type { SafeWalletInfo } from '../types.js';

const GetSafeWalletInfoInputSchema = z.object({
  safeAddress: z.string().optional().describe('Safe wallet address to query (only required for getting info about existing wallets)'),
  chainId: z.string().default('421614').describe('Blockchain chain ID where the Safe wallet exists'),
});

export const getSafeWalletInfoTool: VibkitToolDefinition<typeof GetSafeWalletInfoInputSchema, any, TriggerXContext, any> = {
  name: 'getSafeWalletInfo',
  description: 'Get information about an EXISTING Safe wallet. This tool requires a safeAddress parameter. Use createSafeWallet tool for creating NEW wallets.',
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

      // Note: This is a placeholder implementation
      // In a real implementation, you would query the Safe contract on-chain
      // to get the actual owners, threshold, and module status
      
      const safeInfo: SafeWalletInfo = {
        address: input.safeAddress,
        chainId: input.chainId,
        owners: [], // Would be populated from on-chain data
        threshold: 1, // Would be populated from on-chain data
        isModuleEnabled: false, // Would be populated from on-chain data
      };

      console.log('✅ Safe wallet info retrieved successfully');

      return createSuccessTask(
        'getSafeWalletInfo',
        undefined,
        `Safe wallet information retrieved for address ${input.safeAddress}. Address: ${safeInfo.address}, Chain: ${safeInfo.chainId}, Owners: ${safeInfo.owners.length}, Threshold: ${safeInfo.threshold}, Module Enabled: ${safeInfo.isModuleEnabled}`
      );
    } catch (error) {
      return createErrorTask('getSafeWalletInfo', error instanceof Error ? error : new Error('Unknown error occurred'));
    }
  },
};
