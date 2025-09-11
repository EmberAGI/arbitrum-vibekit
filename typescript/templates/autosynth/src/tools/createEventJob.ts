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
    .describe('Contract address to call when event is detected'),
  targetFunction: z.string().min(1).describe('Function name to call on the target contract'),
  targetAbi: z.string().min(1).describe('Target contract ABI (JSON string)'),
  arguments: z.array(z.string()).default([]).describe('Static arguments for the function call'),
  recurring: z.boolean().default(true).describe('Whether the job should continue listening for events'),
  timeFrame: z.number().positive().default(36).describe('Job validity timeframe in hours'),
  targetChainId: z.string().default('421614').describe('Target blockchain chain ID'),
  dynamicArgumentsScriptUrl: z.string().optional().describe('URL for dynamic argument fetching script'),
  timezone: z.string().default('UTC').describe('Timezone for job execution'),
  userAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).describe('User wallet address for signing transactions'),
});

export const createEventJobTool: VibkitToolDefinition<typeof CreateEventJobInputSchema, any, TriggerXContext, any> = {
  name: 'createEventJob',
  description: 'Create an event-based automated job that triggers when specific blockchain events occur',
  parameters: CreateEventJobInputSchema,
  execute: async (input, context) => {
    console.log('🎯 CreateEventJob tool executing with input:', JSON.stringify(input, null, 2));
    try {
      // Build job input matching the exact SDK example structure
      const jobInput: any = {
        jobType: JobType.Event,
        argType: input.dynamicArgumentsScriptUrl ? ArgType.Dynamic : ArgType.Static,
        jobTitle: input.jobTitle,
        timeFrame: input.timeFrame,
        timezone: input.timezone,
        triggerEvent: input.triggerEvent,
        eventContractAddress: input.eventContractAddress,
        eventAbi: input.eventAbi,
        recurring: input.recurring,
        chainId: input.targetChainId,
        targetContractAddress: input.targetContractAddress,
        targetFunction: input.targetFunction,
        abi: input.targetAbi,
        isImua: false,
        arguments: input.arguments,
        dynamicArgumentsScriptUrl: input.dynamicArgumentsScriptUrl || '',
        autotopupTG: true,
      };

      console.log('📦 Preparing transaction data for user signing...');

      // Create transaction preview
      const txPreview = {
        action: 'createEventJob' as const,
        jobTitle: input.jobTitle,
        triggerEvent: input.triggerEvent,
        eventContract: input.eventContractAddress,
        targetContract: input.targetContractAddress,
        targetFunction: input.targetFunction,
        chainId: input.targetChainId,
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
