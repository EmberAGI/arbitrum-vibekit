/**
 * Create Time-based Job Tool for MCP Server
 * Creates scheduled jobs based on time intervals, cron expressions, or specific times
 */

import { z } from 'zod';
import { JobType, ArgType } from 'sdk-triggerx';

const CreateTimeJobSchema = z.object({
  jobTitle: z.string().min(1).describe('Title for the scheduled job'),
  targetContractAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .describe('Contract address to call'),
  targetFunction: z.string().min(1).describe('Function name to call on the contract'),
  abi: z.string().min(1).describe('Contract ABI (JSON string)'),
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
});

export async function createTimeJob(params: z.infer<typeof CreateTimeJobSchema>) {
  try {
    console.log(' CreateTimeJob executing with input:', JSON.stringify(params, null, 2));
    
    // Validate scheduling parameters for each type
    if (params.scheduleType === 'interval' && !params.timeInterval) {
      throw new Error('timeInterval is required for interval scheduling');
    }
    if (params.scheduleType === 'cron' && !params.cronExpression) {
      throw new Error('cronExpression is required for cron scheduling');
    }
    if (params.scheduleType === 'specific' && !params.specificSchedule) {
      throw new Error('specificSchedule is required for specific time scheduling');
    }

    // Build job input matching the exact SDK structure
    const jobInput: any = {
      jobType: JobType.Time,
      argType: ArgType.Static,
      jobTitle: params.jobTitle,
      timeFrame: params.timeFrame,
      scheduleType: params.scheduleType,
      timezone: params.timezone,
      chainId: params.chainId,
      targetContractAddress: params.targetContractAddress,
      targetFunction: params.targetFunction,
      abi: params.abi,
      isImua: false,
      arguments: params.arguments,
      dynamicArgumentsScriptUrl: params.dynamicArgumentsScriptUrl,
      autotopupTG: true,
    };

    // Only include the relevant scheduling parameter based on the selected schedule type
    if (params.scheduleType === 'interval') {
      jobInput.timeInterval = params.timeInterval;
    } else if (params.scheduleType === 'cron') {
      jobInput.cronExpression = params.cronExpression;
    } else if (params.scheduleType === 'specific') {
      jobInput.specificSchedule = params.specificSchedule;
    }

    console.log(' Preparing transaction data for user signing...');

    // Create transaction preview
    const txPreview = {
      action: 'createTimeJob' as const,
      jobTitle: params.jobTitle,
      scheduleType: params.scheduleType,
      targetContract: params.targetContractAddress,
      targetFunction: params.targetFunction,
      chainId: params.chainId,
      timeInterval: params.timeInterval,
      cronExpression: params.cronExpression,
      specificSchedule: params.specificSchedule,
    };

    // Create transaction artifact for user signing
    const txArtifact = {
      txPreview,
      jobData: {
        jobInput,
        requiresUserSignature: true,
        estimatedCost: '0.01', // Placeholder - can be calculated based on actual costs
      },
    };

    console.log(' Transaction artifact prepared for user signing');

    return {
      success: true,
      message: 'Time-based job configuration ready. Please sign to create the automated job.',
      data: txArtifact,
    };
  } catch (error) {
    console.error(' CreateTimeJob error:', error);
    throw new Error(`Failed to create time job: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export { CreateTimeJobSchema };
