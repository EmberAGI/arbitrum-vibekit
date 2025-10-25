/**
 * Create Safe Wallet Tool
 * Creates a new Safe wallet for the user using TriggerX SDK
 */

import { z } from 'zod';
import type { VibkitToolDefinition } from 'arbitrum-vibekit-core';
import { createSuccessTask, createErrorTask } from 'arbitrum-vibekit-core';
import { createSafeWallet } from 'sdk-triggerx/dist/api/safeWallet.js';
import type { TriggerXContext } from '../context/types.js';
import type { Task } from '@google-a2a/types';
import type { SafeWalletResult } from '../types.js';

const CreateSafeWalletInputSchema = z.object({
  userAddress: z.string().optional().describe('User wallet address for signing transactions (will be auto-detected if not provided)'),
  chainId: z.string().default('421614').describe('Target blockchain chain ID (Arbitrum Sepolia)'),
  // Make it more flexible - allow simple prompts
  prompt: z.string().optional().describe('Simple prompt like "create safe wallet" or "I want to create a safe wallet"'),
});

// Define Safe Wallet Preview Schema
const SafeWalletPreviewSchema = z.object({
  action: z.literal('createSafeWallet'),
  userAddress: z.string(),
  chainId: z.string(),
});

// Define Safe Wallet Transaction Artifact Schema  
const SafeWalletTransactionArtifactSchema = z.object({
  txPreview: SafeWalletPreviewSchema,
  walletData: z.object({
    requiresUserSignature: z.boolean(),
    estimatedCost: z.string().optional(),
    description: z.string(),
  }),
});

type SafeWalletTransactionArtifact = z.infer<typeof SafeWalletTransactionArtifactSchema>;

export const createSafeWalletTool: VibkitToolDefinition<typeof CreateSafeWalletInputSchema, any, TriggerXContext, any> = {
  name: 'createSafeWallet',
  description: 'Create a NEW Safe wallet for automated job execution. This tool creates a completely new Safe wallet - NO safeAddress needed. Just say "create safe wallet" and it will handle everything automatically including wallet detection.',
  parameters: CreateSafeWalletInputSchema,
  execute: async (input, context) => {
    console.log('🔐 CreateSafeWallet tool executing with input:', JSON.stringify(input, null, 2));
    try {
      // Auto-detect user address if not provided
      let userAddress = input.userAddress;
      
      // Validate userAddress if provided
      if (userAddress && !userAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
        console.log('⚠️ Invalid userAddress format provided, will auto-detect or use placeholder');
        userAddress = undefined;
      }
      
      if (!userAddress && context.custom?.signer) {
        try {
          userAddress = await context.custom.signer.getAddress();
          console.log('📍 Auto-detected user address:', userAddress);
        } catch (error) {
          console.log('⚠️ Could not auto-detect user address from signer');
        }
      }

      // If still no user address, use a placeholder that will be replaced by the UI
      if (!userAddress) {
        userAddress = '0x0000000000000000000000000000000000000000'; // Placeholder
        console.log('📍 Using placeholder address - will be replaced by connected wallet in UI');
      }

      // Check if we have a signer in the context
      if (!context.custom?.signer) {
        console.log('📦 No signer available, preparing Safe wallet creation for user signing...');

        // Create transaction preview
        const txPreview = {
          action: 'createSafeWallet' as const,
          userAddress: userAddress,
          chainId: input.chainId,
        };

        // Create transaction artifact for user signing
        const txArtifact: SafeWalletTransactionArtifact = {
          txPreview,
          walletData: {
            requiresUserSignature: true,
            estimatedCost: '0.005', // Estimated gas cost for Safe deployment
            description: 'Create a new Safe wallet that can be used for automated job execution. The Safe wallet will be configured with your address as the owner and the TriggerX module enabled.',
          },
        };

        console.log('✅ Safe wallet creation artifact prepared for user signing');

        // Return task with transaction artifact that requires user signature
        return {
          id: userAddress,
          contextId: `create-safe-wallet-${Date.now()}`,
          kind: 'task',
          status: {
            state: 'completed' as const,
            message: {
              role: 'agent',
              messageId: `msg-${Date.now()}`,
              kind: 'message',
              parts: [{ 
                kind: 'text', 
                text: '🔐 Safe wallet configuration ready! This will create a new Safe wallet with enhanced security features for automated job execution. The Safe wallet will be configured with your address as the owner and the TriggerX module enabled for secure automated transactions. Please review the details below and sign to proceed.' 
              }],
            },
          },
          artifacts: [
            {
              artifactId: `safe-wallet-${Date.now()}`,
              name: 'safe-wallet-creation',
              parts: [{ kind: 'data', data: txArtifact }],
            },
           ],
         } as Task;
      }

      // We have a signer, proceed with actual Safe wallet creation
      console.log('🔐 Creating Safe wallet using SDK with signer...');
      
      const signer = context.custom.signer;
      const safeAddress = await createSafeWallet(signer as any);
      
      console.log('✅ Safe wallet created successfully:', safeAddress);

      const result: SafeWalletResult = {
        success: true,
        safeAddress,
        transactionHash: 'N/A', // SDK doesn't return transaction hash
      };

      return createSuccessTask(
        'createSafeWallet',
        undefined,
        `🎉 Safe wallet created successfully! Address: ${safeAddress}. This Safe wallet is now configured with enhanced security features and can be used for automated job execution. You can now create jobs with walletMode: "safe" and use this address for secure automated transactions.`
      );
    } catch (error) {
      console.error('❌ Failed to create Safe wallet:', error);
      return createErrorTask('createSafeWallet', error instanceof Error ? error : new Error('Unknown error occurred'));
    }
  },
};