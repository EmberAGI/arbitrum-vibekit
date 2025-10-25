/**
 * Create Event-based Job Tool
 * Creates jobs that trigger when specific blockchain events occur
 */

import { z } from 'zod';
import type { VibkitToolDefinition } from 'arbitrum-vibekit-core';
import { createSuccessTask, createErrorTask } from 'arbitrum-vibekit-core';
import { JobType, ArgType } from 'sdk-triggerx';
import type { TriggerXContext } from '../context/types.js';
import type { Task } from '@google-a2a/types';

const CreateEventJobInputSchema = z.object({
  jobTitle: z.string().min(1).describe('Title for the event-based job'),
  triggerEvent: z.string().min(1).describe('Event signature to listen for (e.g., "Transfer(address,address,uint256)")'),
  eventContractAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .describe('Contract address to monitor for events'),
  eventAbi: z.string().min(1).describe('ABI of the contract to monitor (JSON string)'),
  targetContractAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .optional()
    .describe('Contract address to call when event is detected (not required for Safe wallet mode)'),
  targetFunction: z.string().min(1).optional().describe('Function name to call on the target contract (not required for Safe wallet mode)'),
  targetAbi: z.string().min(1).optional().describe('Target contract ABI (JSON string) (not required for Safe wallet mode)'),
  arguments: z.array(z.string()).default([]).describe('Static arguments for the function call'),
  recurring: z.boolean().default(true).describe('Whether the job should continue listening for events'),
  timeFrame: z.number().positive().default(36).describe('Job validity timeframe in hours'),
  targetChainId: z.string().default('421614').describe('Target blockchain chain ID'),
  dynamicArgumentsScriptUrl: z.string().optional().describe('URL for dynamic argument fetching script'),
  timezone: z.string().default('UTC').describe('Timezone for job execution'),
  userAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).describe('User wallet address for signing transactions'),
  walletMode: z.enum(['regular', 'safe']).default('regular').describe('Wallet mode: "regular" for EOA execution or "safe" for Safe wallet execution'),
  safeAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional().describe('Safe wallet address (required when walletMode is "safe")'),
});

export const createEventJobTool: VibkitToolDefinition<typeof CreateEventJobInputSchema, any, TriggerXContext, any> = {
  name: 'createEventJob',
  description: 'Create an event-based automated job that triggers when specific blockchain events occur',
  parameters: CreateEventJobInputSchema,
  execute: async (input, context) => {
    console.log('🎯 CreateEventJob tool executing with input:', JSON.stringify(input, null, 2));
    try {
      // Validate Safe wallet mode requirements
      if (input.walletMode === 'safe') {
        if (!input.safeAddress) {
          throw new Error('safeAddress is required when walletMode is "safe"');
        }
        if (!input.dynamicArgumentsScriptUrl) {
          throw new Error('dynamicArgumentsScriptUrl is required for Safe wallet mode');
        }
      } else {
        // Regular mode requires target contract details
        if (!input.targetContractAddress) {
          throw new Error('targetContractAddress is required for regular wallet mode');
        }
        if (!input.targetFunction) {
          throw new Error('targetFunction is required for regular wallet mode');
        }
        if (!input.targetAbi) {
          throw new Error('targetAbi is required for regular wallet mode');
        }
      }

      // Build job input matching the exact SDK example structure
      const jobInput: any = {
        jobType: JobType.Event,
        argType: input.walletMode === 'safe' ? ArgType.Dynamic : (input.dynamicArgumentsScriptUrl ? ArgType.Dynamic : ArgType.Static),
        jobTitle: input.jobTitle,
        timeFrame: input.timeFrame,
        timezone: input.timezone,
        triggerEvent: input.triggerEvent,
        triggerContractAddress: input.eventContractAddress,
        recurring: input.recurring,
        chainId: input.targetChainId,
        triggerChainId: input.targetChainId,
        isImua: false,
        arguments: input.walletMode === 'safe' ? [] : input.arguments,
        dynamicArgumentsScriptUrl: input.dynamicArgumentsScriptUrl || '',
        autotopupTG: true,
        walletMode: input.walletMode,
      };

      // Add target contract details for regular mode
      if (input.walletMode === 'regular') {
        jobInput.targetContractAddress = input.targetContractAddress;
        jobInput.targetFunction = input.targetFunction;
        jobInput.abi = input.targetAbi;
      } else {
        // Safe mode - add Safe address
        jobInput.safeAddress = input.safeAddress;
      }

      console.log('📦 Preparing transaction data for user signing...');

      // Create transaction preview
      const txPreview = {
        action: 'createEventJob' as const,
        jobTitle: input.jobTitle,
        triggerEvent: input.triggerEvent,
        eventContract: input.eventContractAddress,
        targetContract: input.targetContractAddress || 'Safe Module',
        targetFunction: input.targetFunction || 'execJobFromHub',
        chainId: input.targetChainId,
        walletMode: input.walletMode,
        safeAddress: input.safeAddress,
      };

      // Create transaction artifact for user signing
      const txArtifact = {
        txPreview,
        jobData: {
          jobInput,
          requiresUserSignature: true,
          estimatedCost: '0.01', // Placeholder
        },
      };

      console.log('✅ Transaction artifact prepared for user signing');

      // Return task with transaction artifact that requires user signature
      return {
        id: input.userAddress,
        contextId: `create-event-job-${Date.now()}`,
        kind: 'task',
        status: {
          state: 'completed' as const,
          message: {
            role: 'agent',
            messageId: `msg-${Date.now()}`,
            kind: 'message',
            parts: [{ kind: 'text', text: 'Event job configuration ready. Please sign to create the automated job.' }],
          },
        },
        artifacts: [
          {
            artifactId: `triggerx-job-${Date.now()}`,
            name: 'triggerx-job-plan',
            parts: [{ kind: 'data', data: txArtifact }],
          },
        ],
      } as Task;
    } catch (error) {
      return createErrorTask('createEventJob', error instanceof Error ? error : new Error('Unknown error occurred'));
    }
  },
};
