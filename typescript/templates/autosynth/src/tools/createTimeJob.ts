/**
 * Create Time-based Job Tool
 * Creates scheduled jobs based on time intervals, cron expressions, or specific times
 */

import { z } from 'zod';
import type { VibkitToolDefinition } from 'arbitrum-vibekit-core';
import { createSuccessTask, createErrorTask } from 'arbitrum-vibekit-core';
import { JobType, ArgType } from 'sdk-triggerx';
import type { TriggerXContext } from '../context/types.js';
import { ScheduleType } from '../types.js';
import type { Task } from '@google-a2a/types';

const CreateTimeJobInputSchema = z.object({
  jobTitle: z.string().min(1).describe('Title for the scheduled job'),
  targetContractAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .optional()
    .describe('Contract address to call (not required for Safe wallet mode)'),
  targetFunction: z.string().min(1).optional().describe('Function name to call on the contract (not required for Safe wallet mode)'),
  abi: z.string().min(1).optional().describe('Contract ABI (JSON string) (not required for Safe wallet mode)'),
  arguments: z.array(z.string()).default([]).describe('Static arguments for the function call'),
  scheduleType: z.enum(['interval', 'cron', 'specific']).describe('Type of time-based scheduling: "interval" for recurring intervals, "cron" for cron expressions, or "specific" for one-time execution'),
  timeInterval: z.number().positive().optional().describe('Interval in seconds (for interval scheduling)'),
  cronExpression: z.string().optional().describe('Cron expression (for cron scheduling)'),
  specificSchedule: z.string().optional().describe('Specific datetime (for one-time scheduling)'),
  timeFrame: z.number().positive().default(36).describe('Job validity timeframe in hours'),
  chainId: z.string().default('421614').describe('Target blockchain chain ID (Arbitrum Sepolia)'),
  dynamicArgumentsScriptUrl: z.string().default('').describe('URL for dynamic argument fetching script'),
  timezone: z.string().default('UTC').describe('Timezone for scheduling'),
  userAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).describe('User wallet address for signing transactions'),
  walletMode: z.enum(['regular', 'safe']).default('regular').describe('Wallet mode: "regular" for EOA execution or "safe" for Safe wallet execution'),
  safeAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional().describe('Safe wallet address (required when walletMode is "safe")'),
});

// Define TriggerX Job Preview Schema
const TriggerXJobPreviewSchema = z.object({
  action: z.literal('createTimeJob'),
  jobTitle: z.string(),
  scheduleType: z.string(),
  targetContract: z.string(),
  targetFunction: z.string(),
  chainId: z.string(),
  timeInterval: z.number().optional(),
  cronExpression: z.string().optional(),
  specificSchedule: z.string().optional(),
});

// Define TriggerX Transaction Artifact Schema  
const TriggerXTransactionArtifactSchema = z.object({
  txPreview: TriggerXJobPreviewSchema,
  jobData: z.object({
    jobInput: z.record(z.any()),
    requiresUserSignature: z.boolean(),
    estimatedCost: z.string().optional(),
  }),
});

type TriggerXTransactionArtifact = z.infer<typeof TriggerXTransactionArtifactSchema>;

export const createTimeJobTool: VibkitToolDefinition<typeof CreateTimeJobInputSchema, any, TriggerXContext, any> = {
  name: 'createTimeJob',
  description: 'Create a time-based automated job that executes on a schedule',
  parameters: CreateTimeJobInputSchema,
  execute: async (input, context) => {
    console.log('🕒 CreateTimeJob tool executing with input:', JSON.stringify(input, null, 2));
    try {
      // Validate scheduling parameters for each type
      if (input.scheduleType === 'interval' && !input.timeInterval) {
        throw new Error('timeInterval is required for interval scheduling');
      }
      if (input.scheduleType === 'cron' && !input.cronExpression) {
        throw new Error('cronExpression is required for cron scheduling');
      }
      if (input.scheduleType === 'specific' && !input.specificSchedule) {
        throw new Error('specificSchedule is required for specific time scheduling');
      }

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
        if (!input.abi) {
          throw new Error('abi is required for regular wallet mode');
        }
      }

      // Build job input matching the exact SDK structure
      const jobInput: any = {
        jobType: JobType.Time,
        argType: input.walletMode === 'safe' ? ArgType.Dynamic : ArgType.Static,
        jobTitle: input.jobTitle,
        timeFrame: input.timeFrame,
        scheduleType: input.scheduleType,
        timezone: input.timezone,
        chainId: input.chainId,
        isImua: false,
        arguments: input.walletMode === 'safe' ? [] : input.arguments,
        dynamicArgumentsScriptUrl: input.dynamicArgumentsScriptUrl,
        autotopupTG: true,
        walletMode: input.walletMode,
      };

      // Add target contract details for regular mode
      if (input.walletMode === 'regular') {
        jobInput.targetContractAddress = input.targetContractAddress;
        jobInput.targetFunction = input.targetFunction;
        jobInput.abi = input.abi;
      } else {
        // Safe mode - add Safe address
        jobInput.safeAddress = input.safeAddress;
      }

      // Only include the relevant scheduling parameter based on the selected schedule type
      if (input.scheduleType === 'interval') {
        jobInput.timeInterval = input.timeInterval;
      } else if (input.scheduleType === 'cron') {
        jobInput.cronExpression = input.cronExpression;
      } else if (input.scheduleType === 'specific') {
        jobInput.specificSchedule = input.specificSchedule;
      }

      console.log('📦 Preparing transaction data for user signing...');

      // Create transaction preview
      const txPreview = {
        action: 'createTimeJob' as const,
        jobTitle: input.jobTitle,
        scheduleType: input.scheduleType,
        targetContract: input.targetContractAddress || 'Safe Module',
        targetFunction: input.targetFunction || 'execJobFromHub',
        chainId: input.chainId,
        walletMode: input.walletMode,
        safeAddress: input.safeAddress,
        timeInterval: input.timeInterval,
        cronExpression: input.cronExpression,
        specificSchedule: input.specificSchedule,
      };

      // Create transaction artifact for user signing
      const txArtifact: TriggerXTransactionArtifact = {
        txPreview,
        jobData: {
          jobInput,
          requiresUserSignature: true,
          estimatedCost: '0.01', // Placeholder - can be calculated based on actual costs
        },
      };

      console.log('✅ Transaction artifact prepared for user signing');

      // Return task with transaction artifact that requires user signature
      return {
        id: input.userAddress,
        contextId: `create-time-job-${Date.now()}`,
        kind: 'task',
        status: {
          state: 'completed' as const,
          message: {
            role: 'agent',
            messageId: `msg-${Date.now()}`,
            kind: 'message',
            parts: [{ kind: 'text', text: `Job configuration ready for ${input.walletMode} wallet mode. Please sign to create the automated job.` }],
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
      return createErrorTask('createTimeJob', error instanceof Error ? error : new Error('Unknown error occurred'));
    }
  },
};
