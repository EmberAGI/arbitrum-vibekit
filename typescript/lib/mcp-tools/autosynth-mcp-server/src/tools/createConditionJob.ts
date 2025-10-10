/**
 * Create Condition-based Job Tool for MCP Server
 * Creates jobs that trigger when specified conditions are met
 */

import { z } from 'zod';
import { JobType, ArgType } from 'sdk-triggerx';

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
    .describe('Contract address to call when condition is met'),
  targetFunction: z.string().min(1).describe('Function name to call on the target contract'),
  abi: z.string().min(1).describe('Target contract ABI (JSON string)'),
  arguments: z.array(z.string()).default([]).describe('Static arguments for the function call'),
  recurring: z.boolean().default(false).describe('Whether the job should check condition repeatedly'),
  timeFrame: z.number().positive().default(36).describe('Job validity timeframe in hours'),
  targetChainId: z.string().default('421614').describe('Target blockchain chain ID'),
  dynamicArgumentsScriptUrl: z.string().optional().describe('URL for dynamic argument fetching script'),
  timezone: z.string().default('UTC').describe('Timezone for job execution'),
  userAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).describe('User wallet address for signing transactions'),
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
    const jobInput: any = {
      jobType: JobType.Condition,
      argType: params.dynamicArgumentsScriptUrl ? ArgType.Dynamic : ArgType.Static,
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
      targetContractAddress: params.targetContractAddress,
      targetFunction: params.targetFunction,
      abi: params.abi,
      isImua: false,
      arguments: params.arguments,
      dynamicArgumentsScriptUrl: params.dynamicArgumentsScriptUrl || '',
      autotopupTG: true,
    };

    console.log(' Preparing transaction data for user signing...');

    // Create transaction preview
    const txPreview = {
      action: 'createConditionJob' as const,
      jobTitle: params.jobTitle,
      conditionType: params.conditionType,
      valueSourceType: params.valueSourceType,
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
      message: 'Condition job configuration ready. Please sign to create the automated job.',
      data: txArtifact,
    };
  } catch (error) {
    console.error(' CreateConditionJob error:', error);
    throw new Error(`Failed to create condition job: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export { CreateConditionJobSchema };
