/**
 * Create Time-based Job Tool
 * Creates scheduled jobs based on time intervals, cron expressions, or specific times
 */

import { z } from 'zod';
import { ethers, type Signer } from 'ethers';
import type { VibkitToolDefinition } from 'arbitrum-vibekit-core';
import { createSuccessTask, createErrorTask } from 'arbitrum-vibekit-core';
import { createJob, JobType, ArgType, type CreateJobInput, type CreateJobParams } from 'sdk-triggerx';
import type { TriggerXContext } from '../context/types.js';
import { ScheduleType } from '../types.js';

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
});

export const createTimeJobTool: VibkitToolDefinition<typeof CreateTimeJobInputSchema, any, TriggerXContext, any> = {
  name: 'createTimeJob',
  description: 'Create a time-based automated job that executes on a schedule',
  parameters: CreateTimeJobInputSchema,
  execute: async (input, context) => {
    console.log('🕒 CreateTimeJob tool executing with input:', JSON.stringify(input, null, 2));
    console.log('context', context);
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

      // Get user balance for job cost prediction
      const balance = await context.custom.signer.provider!.getBalance(context.custom.userAddress);
      console.log('balance on Arbitrum Sepolia:', balance);
      const etherBalance = Number(balance);

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

      console.log('context.custom.triggerxClient', context.custom.triggerxClient);
      console.log('Using signer for TriggerX operations');
      console.log('signer type:', typeof context.custom.signer);
      console.log('signer address:', await context.custom.signer.getAddress());
      console.log('signer has provider:', !!context.custom.signer.provider);
      console.log('📤 Creating time job with correct SDK pattern:', JSON.stringify(jobInput, null, 2));

      try {
        console.log('🔄 Calling createJob SDK method...');
        console.log('Using signer from context for TriggerX');
        console.log('Signer address:', await context.custom.signer.getAddress());
        console.log('TriggerX Client API Key:', (context.custom.triggerxClient as any).apiKey);
        console.log('Environment API_KEY:', process.env.API_KEY);

        // Bounded wait to avoid MCP timeout (defaults to 30s to leave buffer for MCP 60s timeout)
        const timeoutMs = Number(process.env.TRIGGERX_CREATE_TIMEOUT_MS || 30000);

        const createJobPromise = (async () => {
          const result = await createJob(context.custom.triggerxClient, {
            jobInput,
            // @ts-ignore
            signer: context.custom.signer,
          });
          console.log('📥 TriggerX SDK response:', JSON.stringify(result, null, 2));
          return result as any;
        })();

        const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve('TIMEOUT'), timeoutMs));
        const raceResult = await Promise.race([createJobPromise, timeoutPromise]);

        if (raceResult === 'TIMEOUT') {
          console.warn(`⏱️ createJob still processing after ${timeoutMs}ms; returning early to avoid MCP timeout`);
          return createSuccessTask(
            'createTimeJob',
            undefined,
            `⏳ Job creation for "${input.jobTitle}" is processing in the background. The TriggerX API is taking longer than expected. Please use "list my jobs" in a few moments to see your new job, or check the TriggerX dashboard.`
          );
        }

        const result: any = raceResult;

        // Extract job ID from various potential SDK shapes
        const extractedJobId =
          result?.jobId ||
          result?.id ||
          result?.data?.jobId ||
          (Array.isArray(result?.data?.job_ids) && result.data.job_ids.length > 0 && result.data.job_ids[0]) ||
          'unknown';

        console.log('✅ Job created successfully with ID:', extractedJobId);

        return createSuccessTask(
          'createTimeJob',
          undefined,
          `Time-based job "${input.jobTitle}" created successfully with ID: ${extractedJobId}`
        );
      } catch (createJobError) {
        console.error('❌ createJob failed:', createJobError);
        console.error('❌ Error name:', (createJobError as any).name);
        console.error('❌ Error message:', (createJobError as any).message);
        console.error('❌ Error stack:', (createJobError as any).stack);

        return createErrorTask(
          'createTimeJob',
          createJobError instanceof Error ? createJobError : new Error('Unknown error occurred')
        );
      }
    } catch (error) {
      return createErrorTask('createTimeJob', error instanceof Error ? error : new Error('Unknown error occurred'));
    }
  },
};
