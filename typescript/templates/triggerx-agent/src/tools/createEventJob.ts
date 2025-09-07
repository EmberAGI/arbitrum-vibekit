/**
 * Create Event-based Job Tool
 * Creates jobs triggered by smart contract events
 */

import { z } from 'zod';
import type { VibkitToolDefinition } from 'arbitrum-vibekit-core';
import { createSuccessTask, createErrorTask } from 'arbitrum-vibekit-core';
import { createJob, JobType, ArgType, type CreateJobInput } from 'sdk-triggerx';
import type { TriggerXContext } from '../context/types.js';
import { type CreateJobResult } from '../types.js';

const CreateEventJobInputSchema = z.object({
  jobTitle: z.string().min(1).describe('Title for the event-triggered job'),
  triggerContractAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .describe('Contract address to monitor for events'),
  triggerEvent: z.string().min(1).describe('Event name to listen for'),
  triggerChainId: z.string().default('421614').describe('Chain ID where the event will be monitored'),
  targetContractAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .describe('Contract address to call when event occurs'),
  targetFunction: z.string().min(1).describe('Function name to call on the target contract'),
  abi: z.string().min(1).describe('Target contract ABI (JSON string)'),
  arguments: z.array(z.string()).default([]).describe('Static arguments for the function call'),
  recurring: z.boolean().default(true).describe('Whether the job should trigger multiple times'),
  timeFrame: z.number().positive().default(36).describe('Job validity timeframe in hours'),
  targetChainId: z.string().default('421614').describe('Target blockchain chain ID'),
  dynamicArgumentsScriptUrl: z.string().optional().describe('URL for dynamic argument fetching script'),
  timezone: z.string().default('UTC').describe('Timezone for job execution'),
});

export const createEventJobTool: VibkitToolDefinition<typeof CreateEventJobInputSchema, any, TriggerXContext, any> = {
  name: 'createEventJob',
  description: 'Create an event-based automated job that triggers when a smart contract event occurs',
  parameters: CreateEventJobInputSchema,
  execute: async (input, context) => {
    try {
      // Get user balance for job cost prediction
      const balance = await context.custom.signer.provider!.getBalance(context.custom.userAddress);
      const etherBalance = Number(balance);

      // Build job input matching the exact SDK example structure
      const jobInput: any = {
        jobType: JobType.Event,
        argType: input.dynamicArgumentsScriptUrl ? ArgType.Dynamic : ArgType.Static,
        jobTitle: input.jobTitle,
        timeFrame: input.timeFrame,
        timezone: input.timezone,
        triggerChainId: input.triggerChainId,
        triggerContractAddress: input.triggerContractAddress,
        triggerEvent: input.triggerEvent,
        chainId: input.targetChainId,
        targetContractAddress: input.targetContractAddress,
        targetFunction: input.targetFunction,
        abi: input.abi,
        isImua: true,
        arguments: input.arguments,
        dynamicArgumentsScriptUrl: input.dynamicArgumentsScriptUrl || '',
        autotopupTG: true,
      };

      console.log('📤 Creating event job with correct SDK pattern:', JSON.stringify(jobInput, null, 2));

      // Bounded wait to avoid MCP timeout (defaults to 30s to leave buffer for MCP 60s timeout)
      const timeoutMs = Number(process.env.TRIGGERX_CREATE_TIMEOUT_MS || 30000);

      const createJobPromise = (async () => {
        const result = await createJob(context.custom.triggerxClient, {
          jobInput,
          signer: context.custom.signer,
        } as any);
        console.log('📥 TriggerX SDK response:', JSON.stringify(result, null, 2));
        return result as any;
      })();

      const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve('TIMEOUT'), timeoutMs));
      const raceResult = await Promise.race([createJobPromise, timeoutPromise]);

      if (raceResult === 'TIMEOUT') {
        console.warn(`⏱️ createJob still processing after ${timeoutMs}ms; returning early to avoid MCP timeout`);
        return createSuccessTask(
          'createEventJob',
          undefined,
          `Job creation for "${input.jobTitle}" is processing. Check back shortly or use "list my jobs" to see it.`
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

      return createSuccessTask(
        'createEventJob',
        undefined,
        `Event-based job "${input.jobTitle}" created successfully with ID: ${extractedJobId}`
      );
    } catch (error) {
      return createErrorTask('createEventJob', error instanceof Error ? error : new Error('Unknown error occurred'));
    }
  },
};
