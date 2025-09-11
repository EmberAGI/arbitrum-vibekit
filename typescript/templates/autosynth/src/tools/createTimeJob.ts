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
    .describe('Contract address to call'),
  targetFunction: z.string().min(1).describe('Function name to call on the contract'),
  abi: z.string().min(1).describe('Contract ABI (JSON string)'),
  arguments: z.array(z.string()).default([]).describe('Static arguments for the function call'),
  scheduleTypes: z.array(z.enum(['interval', 'cron', 'specific'])).min(1).describe('Types of time-based scheduling (can be multiple)'),
  timeInterval: z.number().positive().optional().describe('Interval in seconds (for interval scheduling)'),
  cronExpression: z.string().optional().describe('Cron expression (for cron scheduling)'),
  specificSchedule: z.string().optional().describe('Specific datetime (for one-time scheduling)'),
  recurring: z.boolean().default(false).describe('Whether the job should repeat'),
  timeFrame: z.number().positive().default(36).describe('Job validity timeframe in hours'),
  targetChainId: z.string().default('421614').describe('Target blockchain chain ID (Arbitrum Sepolia)'),
  dynamicArgumentsScriptUrl: z.string().optional().describe('URL for dynamic argument fetching script'),
  timezone: z.string().default('UTC').describe('Timezone for scheduling'),
  userAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).describe('User wallet address for signing transactions'),
});

// Define TriggerX Job Preview Schema
const TriggerXJobPreviewSchema = z.object({
  action: z.literal('createTimeJob'),
  jobTitle: z.string(),
  scheduleTypes: z.array(z.string()),
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
      if (input.scheduleTypes.includes('interval') && !input.timeInterval) {
        throw new Error('timeInterval is required for interval scheduling');
      }
      if (input.scheduleTypes.includes('cron') && !input.cronExpression) {
        throw new Error('cronExpression is required for cron scheduling');
      }
      if (input.scheduleTypes.includes('specific') && !input.specificSchedule) {
        throw new Error('specificSchedule is required for specific time scheduling');
      }

      // Build job input matching the exact SDK example structure
      const jobInput: any = {
        jobType: JobType.Time,
        argType: input.dynamicArgumentsScriptUrl ? ArgType.Dynamic : ArgType.Static,
        jobTitle: input.jobTitle,
        timeFrame: input.timeFrame,
        scheduleTypes: input.scheduleTypes,
        timeInterval: input.timeInterval,
        cronExpression: input.cronExpression,
        specificSchedule: input.specificSchedule,
        timezone: input.timezone,
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
        action: 'createTimeJob' as const,
        jobTitle: input.jobTitle,
        scheduleTypes: input.scheduleTypes,
        targetContract: input.targetContractAddress,
        targetFunction: input.targetFunction,
        chainId: input.targetChainId,
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
            parts: [{ kind: 'text', text: 'Job configuration ready. Please sign to create the automated job.' }],
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
