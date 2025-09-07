/**
 * Create Condition-based Job Tool
 * Creates jobs triggered by API or contract condition checks
 */

import { z } from 'zod';
import type { VibkitToolDefinition } from 'arbitrum-vibekit-core';
import { createSuccessTask, createErrorTask } from 'arbitrum-vibekit-core';
import { createJob, JobType, ArgType, type CreateJobInput } from 'sdk-triggerx';
import type { TriggerXContext } from '../context/types.js';
import { ConditionType, type CreateJobResult } from '../types.js';

const CreateConditionJobInputSchema = z.object({
  jobTitle: z.string().min(1).describe('Title for the condition-based job'),
  conditionType: z
    .enum(['greater_than', 'less_than', 'between', 'equals', 'not_equals', 'greater_equal', 'less_equal'])
    .describe('Type of condition to check'),
  upperLimit: z.number().optional().describe('Upper limit for condition (required for greaterThan)'),
  lowerLimit: z.number().optional().describe('Lower limit for condition (required for lessThan)'),
  valueSourceType: z.enum(['api', 'contract']).describe('Source type for condition value'),
  valueSourceUrl: z.string().url().optional().describe('API URL for value fetching (required for api type)'),
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
});

export const createConditionJobTool: VibkitToolDefinition<
  typeof CreateConditionJobInputSchema,
  any,
  TriggerXContext,
  any
> = {
  name: 'createConditionJob',
  description: 'Create a condition-based automated job that triggers when specified conditions are met',
  parameters: CreateConditionJobInputSchema,
  execute: async (input, context) => {
    try {
      // Validate condition parameters
      if (input.conditionType === 'greater_than' && input.upperLimit === undefined) {
        throw new Error('upperLimit is required for greater_than condition');
      }
      if (input.conditionType === 'less_than' && input.lowerLimit === undefined) {
        throw new Error('lowerLimit is required for less_than condition');
      }
      if (input.valueSourceType === 'api' && !input.valueSourceUrl) {
        throw new Error('valueSourceUrl is required for API-based conditions');
      }

      // Get user balance for job cost prediction
      const balance = await context.custom.signer.provider!.getBalance(context.custom.userAddress);
      const etherBalance = Number(balance);

      // Build job input matching the exact SDK example structure
      const jobInput: any = {
        jobType: JobType.Condition,
        argType: input.dynamicArgumentsScriptUrl ? ArgType.Dynamic : ArgType.Static,
        jobTitle: input.jobTitle,
        timeFrame: input.timeFrame,
        timezone: input.timezone,
        conditionType: input.conditionType,
        upperLimit: input.upperLimit || 0,
        lowerLimit: input.lowerLimit || 0,
        valueSourceType: input.valueSourceType || 'api',
        valueSourceUrl: input.valueSourceUrl || '',
        chainId: input.targetChainId,
        targetContractAddress: input.targetContractAddress,
        targetFunction: input.targetFunction,
        abi: input.abi,
        isImua: true,
        arguments: input.arguments,
        dynamicArgumentsScriptUrl: input.dynamicArgumentsScriptUrl || '',
        autotopupTG: true,
      };

      console.log('📤 Creating condition job with correct SDK pattern:', JSON.stringify(jobInput, null, 2));

      // Bounded wait to avoid MCP timeout (defaults to 30s to leave buffer for MCP 60s timeout)
      const timeoutMs = Number(process.env.TRIGGERX_CREATE_TIMEOUT_MS || 30000);
      
      const createJobPromise = (async () => {
        const result = await createJob(context.custom.triggerxClient, {
          jobInput,
          signer: context.custom.signer,
        } as any);
        return result as any;
      })();

      const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve('TIMEOUT'), timeoutMs));
      const raceResult = await Promise.race([createJobPromise, timeoutPromise]);

      if (raceResult === 'TIMEOUT') {
        console.warn(`⏱️ createJob still processing after ${timeoutMs}ms; returning early to avoid MCP timeout`);
        return createSuccessTask(
          'createConditionJob',
          undefined,
          `⏳ Job creation for "${input.jobTitle}" is processing in the background. Please use "list my jobs" in a few moments to see your new job.`
        );
      }

      const result: any = raceResult;

      console.log('📥 TriggerX SDK response:', JSON.stringify(result, null, 2));

      // Extract job ID from response
      const jobId = (result as any).jobId || (result as any).id || (result as any).data?.jobId || 'unknown';

      return createSuccessTask(
        'createConditionJob',
        undefined,
        `Condition-based job "${input.jobTitle}" created successfully with ID: ${jobId}`
      );
    } catch (error) {
      return createErrorTask(
        'createConditionJob',
        error instanceof Error ? error : new Error('Unknown error occurred')
      );
    }
  },
};
