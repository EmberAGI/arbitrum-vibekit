/**
 * Create Event-based Job Tool for MCP Server
 * Creates jobs that trigger when specific blockchain events occur
 */

import { z } from 'zod';
import { JobType, ArgType, TriggerXClient, createJob } from 'sdk-triggerx';
import { ethers } from 'ethers';

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
    .optional()
    .describe('Contract address to call when event is detected (NOT required for Safe mode)'),
  targetFunction: z.string().min(1).optional().describe('Function name to call on the target contract (auto-set to "execJobFromHub" for Safe mode)'),
  targetAbi: z.string().min(1).optional().describe('Target contract ABI (JSON string) - not required for Safe mode'),
  arguments: z.array(z.string()).default([]).describe('Static arguments for the function call'),
  recurring: z.boolean().default(true).describe('Whether the job should continue listening for events'),
  timeFrame: z.number().positive().default(36).describe('Job validity timeframe in hours'),
  targetChainId: z.string().default('421614').describe('Target blockchain chain ID'),
  dynamicArgumentsScriptUrl: z.string().optional().describe('URL for dynamic argument fetching script'),
  timezone: z.string().default('UTC').describe('Timezone for job execution'),
  userAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).describe('User wallet address for signing transactions'),
  walletMode: z.enum(['regular','safe']).default('regular').describe('Wallet mode for execution'),
  safeAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional().describe('Safe wallet address (required for Safe mode)'),
  language: z.string().optional().describe('Code language for the dynamic arguments script (e.g., "go", "javascript", "python")'),
  autotopupTG: z.boolean().default(true).describe('Whether to automatically top up TG balance if low'),
});

export async function createEventJob(params: z.infer<typeof CreateEventJobSchema>) {
  try {
    console.log(' CreateEventJob executing with input:', JSON.stringify(params, null, 2));
    
    // Build job input matching the exact SDK structure
    const isSafe = params.walletMode === 'safe' || !!params.safeAddress;
    const jobInput: any = {
      jobType: JobType.Event,
      argType: isSafe || params.dynamicArgumentsScriptUrl ? ArgType.Dynamic : ArgType.Static,
      jobTitle: params.jobTitle,
      timeFrame: params.timeFrame,
      timezone: params.timezone,
      triggerEvent: params.triggerEvent,
      eventContractAddress: params.eventContractAddress,
      eventAbi: params.eventAbi,
      recurring: params.recurring,
      chainId: params.targetChainId,
      targetContractAddress: isSafe ? undefined : params.targetContractAddress,
      targetFunction: isSafe ? 'execJobFromHub' : params.targetFunction,
      abi: isSafe ? undefined : params.targetAbi,
      isImua: false,
      arguments: isSafe ? [] : params.arguments,
      dynamicArgumentsScriptUrl: params.dynamicArgumentsScriptUrl || '',
      autotopupTG: params.autotopupTG,
      walletMode: isSafe ? 'safe' : 'regular',
      language: params.language || '',
      safeAddress: isSafe ? params.safeAddress : undefined,
    };

    // Decide signing mode (server-side signing if env credentials exist)
    const apiKey = process.env.NEXT_PUBLIC_TRIGGERX_API_KEY;
    const rpcUrl = process.env.MCP_RPC_URL;
    const privateKey = process.env.MCP_PRIVATE_KEY;
    const shouldAutosign = !!(rpcUrl && privateKey && apiKey);

    if (shouldAutosign) {
      console.error(' 🔑 Using server-side signer (env) to create event job');
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const wallet = new ethers.Wallet(privateKey as string, provider);
      const triggerxClient = new TriggerXClient(apiKey!);

      const result = await createJob(triggerxClient, {
        jobInput,
        signer: wallet,
      });

      console.error(' ✅ Event job created (server-side):', result);
      if ((result as any)?.success === false) {
        return { success: false, error: (result as any)?.error || 'Failed to create event job', data: { result } } as any;
      }
      return {
        success: true,
        message: 'Event job created via server signer',
        data: {
          jobId: (result as any)?.jobId || (result as any)?.id || (result as any)?.data?.jobId || 'unknown',
          result,
        },
      };
    }

    console.error(' 📝 No server signer (or Safe mode); returning artifact for client-side signing');

    // Create transaction preview (for client-side signing)
    const txPreview = {
      action: 'createEventJob' as const,
      jobTitle: params.jobTitle,
      triggerEvent: params.triggerEvent,
      eventContract: params.eventContractAddress,
      targetContract: params.targetContractAddress,
      targetFunction: params.targetFunction,
      chainId: params.targetChainId,
    };

    const txArtifact = {
      txPreview,
      jobData: {
        jobInput,
        requiresUserSignature: true,
        estimatedCost: '0.01',
      },
    };

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
