/**
 * Create Time-based Job Tool for MCP Server
 * Creates scheduled jobs based on time intervals, cron expressions, or specific times
 */

import { z } from 'zod';
import { JobType, ArgType, TriggerXClient, createJob } from 'sdk-triggerx';
import { ethers } from 'ethers';

const CreateTimeJobSchema = z.object({
  jobTitle: z.string().min(1).describe('Title for the scheduled job'),
  targetContractAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .optional()
    .describe('Contract address to call (NOT required for Safe wallet mode)'),
  targetFunction: z.string().min(1).optional().describe('Function name to call on the contract (auto-set to "execJobFromHub" for Safe mode)'),
  abi: z.string().min(1).optional().describe('Contract ABI (JSON string) - not needed for Safe mode'),
  arguments: z.array(z.string()).default([]).describe('Static arguments for the function call'),
  scheduleType: z.enum(['interval', 'cron', 'specific']).describe('Type of time-based scheduling: "interval" for recurring intervals, "cron" for cron expressions, or "specific" for one-time execution'),
  timeInterval: z.number().positive().optional().describe('Interval in seconds (for interval scheduling)'),
  cronExpression: z.string().optional().describe('Cron expression (for cron scheduling)'),
  specificSchedule: z.string().optional().describe('Specific datetime (for one-time scheduling)'),
  timeFrame: z.number().positive().default(36).describe('Job validity timeframe in hours'),
  chainId: z.string().default('421614').describe('Target blockchain chain ID (Arbitrum Sepolia)'),
  dynamicArgumentsScriptUrl: z.string().default('').describe('URL for dynamic argument fetching script (REQUIRED for Safe mode)'),
  timezone: z.string().default('UTC').describe('Timezone for scheduling'),
  userAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).describe('User wallet address for signing transactions'),
  walletMode: z.enum(['regular','safe']).default('regular').describe('Wallet mode. Use "safe" to execute via Safe wallet'),
  safeAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional().describe('Safe wallet address (required for Safe mode)'),
  language: z.string().optional().describe('Code language for the dynamic arguments script (e.g., "go", "javascript", "python")'),
  autotopupTG: z.boolean().default(true).describe('Whether to automatically top up TG balance if low'),
});

export async function createTimeJob(params: z.infer<typeof CreateTimeJobSchema>) {
  try {
    console.error(' CreateTimeJob executing with input:', JSON.stringify(params, null, 2));
    
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
    const isSafe = params.walletMode === 'safe' || !!params.safeAddress;
    const jobInput: any = {
      jobType: JobType.Time,
      argType: isSafe ? ArgType.Dynamic : ArgType.Static,
      jobTitle: params.jobTitle,
      timeFrame: params.timeFrame,
      scheduleType: params.scheduleType,
      timezone: params.timezone,
      chainId: params.chainId,
      targetContractAddress: isSafe ? undefined : params.targetContractAddress,
      targetFunction: isSafe ? 'execJobFromHub' : params.targetFunction,
      abi: isSafe ? undefined : params.abi,
      isImua: false,
      arguments: isSafe ? [] : params.arguments,
      dynamicArgumentsScriptUrl: params.dynamicArgumentsScriptUrl,
      autotopupTG: params.autotopupTG,
      walletMode: isSafe ? 'safe' : 'regular',
      language: params.language || '',
      safeAddress: isSafe ? params.safeAddress : undefined,
    };

    // Only include the relevant scheduling parameter based on the selected schedule type
    if (params.scheduleType === 'interval') {
      jobInput.timeInterval = params.timeInterval;
    } else if (params.scheduleType === 'cron') {
      jobInput.cronExpression = params.cronExpression;
    } else if (params.scheduleType === 'specific') {
      jobInput.specificSchedule = params.specificSchedule;
    }

    // Decide signing mode (server-side signing if env credentials exist)
    const apiKey = process.env.NEXT_PUBLIC_TRIGGERX_API_KEY;
    const rpcUrl = process.env.MCP_RPC_URL;
    const privateKey = process.env.MCP_PRIVATE_KEY;
    const shouldAutosign = !!(rpcUrl && privateKey && apiKey);

    if (shouldAutosign) {
      console.error(' 🔑 Using server-side signer (env) to create job');
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const wallet = new ethers.Wallet(privateKey as string, provider);
      const triggerxClient = new TriggerXClient(apiKey!);

      const result = await createJob(triggerxClient, {
        jobInput,
        signer: wallet,
      });

      console.error(' ✅ Job created (server-side):', result);
      if ((result as any)?.success === false) {
        const error = (result as any)?.error || 'Failed to create job via server signer';
        const errorCode = (result as any)?.errorCode;
        const httpStatusCode = (result as any)?.httpStatusCode;
        
        // Provide specific error messages for common issues
        let specificError = error;
        if (errorCode === 'BALANCE_ERROR' && error.includes('top up TG balance')) {
          specificError = 'Failed to top up TG balance. Either fund your TG balance on TriggerX or set autotopupTG: false to skip auto top-up.';
        } else if (httpStatusCode === 400) {
          specificError = 'Bad request to TriggerX API. Check your job parameters, API key, and Safe wallet configuration.';
        } else if (errorCode === 'NONCE_EXPIRED') {
          specificError = 'Transaction nonce expired. This usually happens with network congestion or timing issues. Please retry.';
        }
        
        return {
          success: false,
          error: specificError,
          errorCode,
          httpStatusCode,
          data: { result },
        } as any;
      }
      return {
        success: true,
        message: 'Time-based job created via server signer',
        data: {
          jobId: (result as any)?.jobId || (result as any)?.id || (result as any)?.data?.jobId || 'unknown',
          result,
        },
      };
    }

    console.error(' 📝 No server signer (or Safe mode); returning artifact for client-side signing');

    // Create transaction preview (for client-side signing)
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
      message: 'Time-based job configuration ready. Please sign to create the automated job.',
      data: txArtifact,
    };
  } catch (error) {
    console.error(' CreateTimeJob error:', error);
    
    // Handle specific error types
    let errorMessage = 'Unknown error';
    if (error instanceof Error) {
      errorMessage = error.message;
      
      // Handle timeout errors
      if (error.message.includes('timeout') || error.message.includes('TIMEOUT')) {
        errorMessage = 'Request timed out. Try using a faster RPC endpoint or reducing the complexity of your dynamic arguments script.';
      }
      // Handle network errors
      else if (error.message.includes('network') || error.message.includes('NETWORK_ERROR')) {
        errorMessage = 'Network error. Check your RPC endpoint and internet connection.';
      }
      // Handle RPC errors
      else if (error.message.includes('SERVER_ERROR') || error.message.includes('403')) {
        errorMessage = 'RPC endpoint error. Ensure your RPC provider supports Arbitrum Sepolia and your API key is valid.';
      }
    }
    
    throw new Error(`Failed to create time job: ${errorMessage}`);
  }
}

export { CreateTimeJobSchema };
