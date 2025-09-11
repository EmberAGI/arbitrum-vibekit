/**
 * Create Condition-based Job Tool
 * Creates jobs that trigger when specified conditions are met
 */

import { z } from 'zod';
import type { VibkitToolDefinition } from 'arbitrum-vibekit-core';
import { createSuccessTask, createErrorTask } from 'arbitrum-vibekit-core';
import { JobType, ArgType } from 'sdk-triggerx';
import type { TriggerXContext } from '../context/types.js';
import type { Task } from '@google-a2a/types';

const CreateConditionJobInputSchema = z.object({
  jobTitle: z.string().min(1).describe('Title for the condition-based job'),
  conditionType: z.enum(['value', 'event']).describe('Type of condition to monitor'),
  valueSourceType: z.enum(['contract', 'api']).describe('Source type for value-based conditions'),
  valueSourceContractAddress: z.string().optional().describe('Contract address for value source (contract type)'),
  valueSourceFunction: z.string().optional().describe('Function to call for value (contract type)'),
  valueSourceUrl: z.string().optional().describe('API URL for value source (API type)'),
  operator: z.enum(['>', '<', '>=', '<=', '==', '!=']).describe('Comparison operator'),
  targetValue: z.string().describe('Target value to compare against'),
  targetContractAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .describe('Contract address to call when condition is met'),
  targetFunction: z.string().min(1).describe('Function name to call on the target contract'),
  abi: z.string().min(1).describe('Target contract ABI (JSON string)'),
  arguments: z.array(z.string()).default([]).describe('Static arguments for the function call'),
  recurring: z.boolean().default(false).describe('Whether the job should check condition repeatedly'),
  timeFrame: z.number().positive().default(36).describe('Job validity timeframe in hours'),
  targetChainId: z.string().default('421614').describe('Target blockchain chain ID'),
  dynamicArgumentsScriptUrl: z.string().optional().describe('URL for dynamic argument fetching script'),
  timezone: z.string().default('UTC').describe('Timezone for job execution'),
  userAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).describe('User wallet address for signing transactions'),
});

export const createConditionJobTool: VibkitToolDefinition<typeof CreateConditionJobInputSchema, any, TriggerXContext, any> = {
  name: 'createConditionJob',
  description: 'Create a condition-based automated job that triggers when specified conditions are met',
  parameters: CreateConditionJobInputSchema,
  execute: async (input, context) => {
    console.log('📊 CreateConditionJob tool executing with input:', JSON.stringify(input, null, 2));
    try {
      // Validate condition parameters
      if (input.valueSourceType === 'contract' && (!input.valueSourceContractAddress || !input.valueSourceFunction)) {
        throw new Error('valueSourceContractAddress and valueSourceFunction are required for contract-based conditions');
      }
      if (input.valueSourceType === 'api' && !input.valueSourceUrl) {
        throw new Error('valueSourceUrl is required for API-based conditions');
      }

      // Build job input matching the exact SDK example structure
      const jobInput: any = {
        jobType: JobType.Condition,
        argType: input.dynamicArgumentsScriptUrl ? ArgType.Dynamic : ArgType.Static,
        jobTitle: input.jobTitle,
        timeFrame: input.timeFrame,
        timezone: input.timezone,
        conditionType: input.conditionType,
        valueSourceType: input.valueSourceType,
        valueSourceContractAddress: input.valueSourceContractAddress || '',
        valueSourceFunction: input.valueSourceFunction || '',
        valueSourceUrl: input.valueSourceUrl || '',
        operator: input.operator,
        targetValue: input.targetValue,
        recurring: input.recurring,
        chainId: input.targetChainId,
        targetContractAddress: input.targetContractAddress,
        targetFunction: input.targetFunction,
        abi: input.abi,
        isImua: false,
        arguments: input.arguments,
        dynamicArgumentsScriptUrl: input.dynamicArgumentsScriptUrl || '',
        autotopupTG: true,
      };

      console.log('📦 Preparing transaction data for user signing...');

      // Create transaction preview
      const txPreview = {
        action: 'createConditionJob' as const,
        jobTitle: input.jobTitle,
        conditionType: input.conditionType,
        valueSourceType: input.valueSourceType,
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
          // estimatedCost: '0.01', // Placeholder
        },
      };

      console.log('✅ Transaction artifact prepared for user signing');

      // Return task with transaction artifact that requires user signature
      return {
        id: input.userAddress,
        contextId: `create-condition-job-${Date.now()}`,
        kind: 'task',
        status: {
          state: 'completed' as const,
          message: {
            role: 'agent',
            messageId: `msg-${Date.now()}`,
            kind: 'message',
            parts: [{ kind: 'text', text: 'Condition job configuration ready. Please sign to create the automated job.' }],
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
      return createErrorTask('createConditionJob', error instanceof Error ? error : new Error('Unknown error occurred'));
    }
  },
};
