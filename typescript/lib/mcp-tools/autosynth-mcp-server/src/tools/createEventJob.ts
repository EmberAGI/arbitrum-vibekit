/**
 * Create Event-based Job Tool for MCP Server
 * Creates jobs that trigger when specific blockchain events occur
 */

import { z } from 'zod';
import { JobType, ArgType } from 'sdk-triggerx';

const CreateEventJobSchema = z.object({
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

export async function createEventJob(params: z.infer<typeof CreateEventJobSchema>) {
  try {
    console.log(' CreateEventJob executing with input:', JSON.stringify(params, null, 2));
    
    // Build job input matching the exact SDK structure
    const jobInput: any = {
      jobType: JobType.Event,
      argType: params.dynamicArgumentsScriptUrl ? ArgType.Dynamic : ArgType.Static,
      jobTitle: params.jobTitle,
      timeFrame: params.timeFrame,
      timezone: params.timezone,
      triggerEvent: params.triggerEvent,
      eventContractAddress: params.eventContractAddress,
      eventAbi: params.eventAbi,
      recurring: params.recurring,
      chainId: params.targetChainId,
      targetContractAddress: params.targetContractAddress,
      targetFunction: params.targetFunction,
      abi: params.targetAbi,
      isImua: false,
      arguments: params.arguments,
      dynamicArgumentsScriptUrl: params.dynamicArgumentsScriptUrl || '',
      autotopupTG: true,
    };

    console.log(' Preparing transaction data for user signing...');

    // Create transaction preview
    const txPreview = {
      action: 'createEventJob' as const,
      jobTitle: params.jobTitle,
      triggerEvent: params.triggerEvent,
      eventContract: params.eventContractAddress,
      targetContract: params.targetContractAddress,
      targetFunction: params.targetFunction,
      chainId: params.targetChainId,
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

    console.log(' Transaction artifact prepared for user signing');

    return {
      success: true,
      message: 'Event job configuration ready. Please sign to create the automated job.',
      data: txArtifact,
    };
  } catch (error) {
    console.error(' CreateEventJob error:', error);
    throw new Error(`Failed to create event job: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export { CreateEventJobSchema };
