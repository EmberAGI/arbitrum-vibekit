/**
 * Create Condition-based Job Tool for MCP Server
 * Creates jobs that trigger when specified conditions are met
 */

import { z } from 'zod';
import { JobType, ArgType, TriggerXClient, createJob } from 'sdk-triggerx';
import { ethers } from 'ethers';

const CreateConditionJobSchema = z.object({
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
    .optional()
    .describe('Contract address to call when condition is met (NOT required for Safe mode)'),
  targetFunction: z.string().min(1).optional().describe('Function name to call on the target contract (auto-set to "execJobFromHub" for Safe mode)'),
  abi: z.string().min(1).optional().describe('Target contract ABI (JSON string) - not required for Safe mode'),
  arguments: z.array(z.string()).default([]).describe('Static arguments for the function call'),
  recurring: z.boolean().default(false).describe('Whether the job should check condition repeatedly'),
  timeFrame: z.number().positive().default(36).describe('Job validity timeframe in hours'),
  targetChainId: z.string().default('421614').describe('Target blockchain chain ID'),
  dynamicArgumentsScriptUrl: z.string().optional().describe('URL for dynamic argument fetching script'),
  timezone: z.string().default('UTC').describe('Timezone for job execution'),
  userAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).describe('User wallet address for signing transactions'),
  walletMode: z.enum(['regular','safe']).default('regular').describe('Wallet mode for execution'),
  safeAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional().describe('Safe wallet address (required for Safe mode)'),
  autotopupTG: z.boolean().default(true).describe('Whether to automatically top up TG balance if low'),
});

export async function createConditionJob(params: z.infer<typeof CreateConditionJobSchema>) {
  try {
    console.log(' CreateConditionJob executing with input:', JSON.stringify(params, null, 2));
    
    // Validate condition parameters
    if (params.valueSourceType === 'contract' && (!params.valueSourceContractAddress || !params.valueSourceFunction)) {
      throw new Error('valueSourceContractAddress and valueSourceFunction are required for contract-based conditions');
    }
    if (params.valueSourceType === 'api' && !params.valueSourceUrl) {
      throw new Error('valueSourceUrl is required for API-based conditions');
    }

    // Build job input matching the exact SDK structure
    const isSafe = params.walletMode === 'safe' || !!params.safeAddress;
    const jobInput: any = {
      jobType: JobType.Condition,
      argType: isSafe || params.dynamicArgumentsScriptUrl ? ArgType.Dynamic : ArgType.Static,
      jobTitle: params.jobTitle,
      timeFrame: params.timeFrame,
      timezone: params.timezone,
      conditionType: params.conditionType,
      valueSourceType: params.valueSourceType,
      valueSourceContractAddress: params.valueSourceContractAddress || '',
      valueSourceFunction: params.valueSourceFunction || '',
      valueSourceUrl: params.valueSourceUrl || '',
      operator: params.operator,
      targetValue: params.targetValue,
      recurring: params.recurring,
      chainId: params.targetChainId,
      targetContractAddress: isSafe ? undefined : params.targetContractAddress,
      targetFunction: isSafe ? 'execJobFromHub' : params.targetFunction,
      abi: isSafe ? undefined : params.abi,
      isImua: false,
      arguments: isSafe ? [] : params.arguments,
      dynamicArgumentsScriptUrl: params.dynamicArgumentsScriptUrl || '',
      autotopupTG: params.autotopupTG,
      walletMode: isSafe ? 'safe' : 'regular',
      safeAddress: isSafe ? params.safeAddress : undefined,
    };

    // Decide signing mode (server-side signing if env credentials exist)
    const apiKey = process.env.NEXT_PUBLIC_TRIGGERX_API_KEY;
    const rpcUrl = process.env.MCP_RPC_URL;
    const privateKey = process.env.MCP_PRIVATE_KEY;
    const shouldAutosign = !!(rpcUrl && privateKey && apiKey);

    if (shouldAutosign) {
      console.error(' 🔑 Using server-side signer (env) to create condition job');
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const wallet = new ethers.Wallet(privateKey as string, provider);
      const triggerxClient = new TriggerXClient(apiKey!);

      const result = await createJob(triggerxClient, {
        jobInput,
        signer: wallet,
      });

      console.error(' ✅ Condition job created (server-side):', result);
      if ((result as any)?.success === false) {
        return { success: false, error: (result as any)?.error || 'Failed to create condition job', data: { result } } as any;
      }
      return {
        success: true,
        message: 'Condition job created via server signer',
        data: {
          jobId: (result as any)?.jobId || (result as any)?.id || (result as any)?.data?.jobId || 'unknown',
          result,
        },
      };
    }

    console.error(' 📝 No server signer (or Safe mode); returning artifact for client-side signing');

    // Create transaction preview (for client-side signing)
    const txPreview = {
      action: 'createConditionJob' as const,
      jobTitle: params.jobTitle,
      conditionType: params.conditionType,
      valueSourceType: params.valueSourceType,
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
      message: 'Condition job configuration ready. Please sign to create the automated job.',
      data: txArtifact,
    };
  } catch (error) {
    console.error(' CreateConditionJob error:', error);
    throw new Error(`Failed to create condition job: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export { CreateConditionJobSchema };
