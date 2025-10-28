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
    .optional()
    .describe('Contract address (NOT needed for Safe wallet mode - SDK auto-sets to Safe Module. Only needed for regular wallet mode.)'),
  targetFunction: z.string().min(1).optional().describe('Function name (NOT needed for Safe wallet mode - SDK uses execJobFromHub. Only needed for regular wallet mode.)'),
  abi: z.string().min(1).optional().describe('Contract ABI (NOT needed for Safe wallet mode - SDK handles Safe Module ABI. Only needed for regular wallet mode.)'),
  arguments: z.array(z.string()).default([]).describe('Static arguments for function call (NOT allowed in Safe wallet mode - use dynamicArgumentsScriptUrl)'),
  scheduleType: z.enum(['interval', 'cron', 'specific']).describe('Type of time-based scheduling: "interval" for recurring intervals, "cron" for cron expressions, or "specific" for one-time execution'),
  timeInterval: z.number().positive().optional().describe('Interval in seconds (for interval scheduling)'),
  cronExpression: z.string().optional().describe('Cron expression (for cron scheduling)'),
  specificSchedule: z.string().optional().describe('Specific datetime (for one-time scheduling)'),
  timeFrame: z.number().positive().default(36).describe('Job validity timeframe in hours'),
  chainId: z.string().default('421614').describe('Target blockchain chain ID (Arbitrum Sepolia)'),
  dynamicArgumentsScriptUrl: z.string().default('').describe('URL for dynamic argument fetching script (REQUIRED for Safe wallet mode)'),
  timezone: z.string().default('UTC').describe('Timezone for scheduling'),
  userAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).describe('User wallet address for signing transactions'),
  walletMode: z.enum(['regular', 'safe']).default('regular').describe('Wallet mode: "regular" for EOA execution or "safe" for Safe wallet execution'),
  safeAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional().describe('Safe wallet address (REQUIRED when walletMode is "safe" - must be created first)'),
});

// Define TriggerX Job Preview Schema
const TriggerXJobPreviewSchema = z.object({
  action: z.literal('createTimeJob'),
  jobTitle: z.string(),
  scheduleType: z.string(),
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
  description: `Create a time-based automated job that executes on a schedule.

For Safe wallet mode (when safeAddress is provided):
- REQUIRED: jobTitle, scheduleType, timeInterval, timezone, safeAddress, dynamicArgumentsScriptUrl
- Optional: chainId, timeFrame, walletMode
- NOT REQUIRED: targetContractAddress, targetFunction, abi, arguments

For regular wallet mode:
- REQUIRED: jobTitle, scheduleType, timeInterval, timezone, targetContractAddress, targetFunction, abi, arguments

Examples:
- Safe mode: {"jobTitle":"My Job","scheduleType":"interval","timeInterval":60,"timezone":"UTC","safeAddress":"0x1234","dynamicArgumentsScriptUrl":"https://ipfs.io/ipfs/xyz","userAddress":"0xabcd","walletMode":"safe"}
- Regular mode: {"jobTitle":"My Job","scheduleType":"interval","timeInterval":60,"timezone":"UTC","targetContractAddress":"0x1234","targetFunction":"hello","abi":"[...]","arguments":["test"],"userAddress":"0xabcd","walletMode":"regular"}`,
  parameters: CreateTimeJobInputSchema,
  execute: async (input, context) => {
    console.log('🕒 CreateTimeJob tool executing with input:', JSON.stringify(input, null, 2));
    console.log('🔍 Pre-processing state:');
    console.log('   - safeAddress:', input.safeAddress);
    console.log('   - walletMode:', input.walletMode);
    console.log('   - dynamicArgumentsScriptUrl:', input.dynamicArgumentsScriptUrl);
    
    // CRITICAL: If user specified Safe wallet mode with safeAddress, ensure walletMode is set correctly
    if (input.safeAddress && input.walletMode !== 'safe') {
      console.log('⚠️ WARNING: safeAddress provided but walletMode is not "safe". Setting to safe mode.');
      console.log('   safeAddress:', input.safeAddress);
      console.log('   walletMode was:', input.walletMode);
      input.walletMode = 'safe';
      console.log('   walletMode now:', input.walletMode);
    }
    
    // CRITICAL: If walletMode is 'safe' but no URL provided, this will fail
    if (input.walletMode === 'safe' && (!input.dynamicArgumentsScriptUrl || input.dynamicArgumentsScriptUrl.trim() === '')) {
      console.error('❌ EARLY REJECT: Safe wallet mode requires dynamicArgumentsScriptUrl');
      console.error('   This will fail validation. Missing URL prevents job creation.');
      throw new Error('Safe wallet mode requires dynamicArgumentsScriptUrl (IPFS script URL) and cannot be empty.');
    }
    
    // CRITICAL: Early fail if Safe mode params are inconsistent
    if (input.safeAddress && input.walletMode === 'regular') {
      console.error('❌ FATAL: Cannot use Safe address with regular wallet mode');
      throw new Error('safeAddress provided but walletMode is "regular". When using a Safe wallet, walletMode MUST be "safe".');
    }
    
    // CRITICAL: If walletMode is now 'safe', ensure we have all required params
    if (input.walletMode === 'safe') {
      console.log('✅ Safe wallet mode confirmed');
      if (!input.safeAddress) {
        throw new Error('safeAddress is required when walletMode is "safe"');
      }
      if (!input.dynamicArgumentsScriptUrl || input.dynamicArgumentsScriptUrl.trim() === '') {
        throw new Error('dynamicArgumentsScriptUrl is required for Safe wallet mode and cannot be empty');
      }
    }
    
    console.log('📝 Final wallet mode:', input.walletMode);
    console.log('📝 Has safeAddress:', !!input.safeAddress);
    console.log('📝 Has dynamic URL:', !!(input.dynamicArgumentsScriptUrl && input.dynamicArgumentsScriptUrl.trim()));
    
    try {
      // Validate scheduling parameters for each type
      if (input.scheduleType === 'interval' && !input.timeInterval) {
        throw new Error('timeInterval is required for interval scheduling');
      }
      if (input.scheduleType === 'cron' && !input.cronExpression) {
        throw new Error('cronExpression is required for cron scheduling');
      }
      if (input.scheduleType === 'specific' && !input.specificSchedule) {
        throw new Error('specificSchedule is required for specific time scheduling');
      }

      // Validate Safe wallet mode requirements based on SDK documentation
      if (input.walletMode === 'safe') {
        if (!input.safeAddress) {
          throw new Error('safeAddress is required when walletMode is "safe". Please create a Safe wallet first using the createSafeWallet tool.');
        }
        // Check for dynamic arguments - must be provided and non-empty
        if (!input.dynamicArgumentsScriptUrl || input.dynamicArgumentsScriptUrl.trim() === '') {
          throw new Error('dynamicArgumentsScriptUrl is required for Safe wallet mode and cannot be empty. Safe wallets only support dynamic arguments (ArgType.Dynamic). Please provide a valid IPFS URL.');
        }
        // Safe mode doesn't allow static arguments - they must come from IPFS script
        if (input.arguments && input.arguments.length > 0) {
          throw new Error('Static arguments are not allowed in Safe wallet mode. All parameters must come from dynamicArgumentsScriptUrl.');
        }
      } else {
        // Regular mode requires target contract details
        if (!input.targetContractAddress) {
          throw new Error('targetContractAddress is required for regular wallet mode');
        }
        if (!input.targetFunction) {
          throw new Error('targetFunction is required for regular wallet mode');
        }
        if (!input.abi) {
          throw new Error('abi is required for regular wallet mode');
        }
      }

      // Build job input matching the exact SDK structure
      const jobInput: any = {
        jobType: JobType.Time,
        argType: input.walletMode === 'safe' ? ArgType.Dynamic : ArgType.Static,
        jobTitle: input.jobTitle,
        timeFrame: input.timeFrame,
        scheduleType: input.scheduleType,
        timezone: input.timezone,
        chainId: input.chainId,
        isImua: false,
        arguments: input.walletMode === 'safe' ? [] : input.arguments,
        dynamicArgumentsScriptUrl: input.dynamicArgumentsScriptUrl,
        autotopupTG: true,
        walletMode: input.walletMode,
      };

      // Add target contract details for regular mode only
      if (input.walletMode === 'regular') {
        jobInput.targetContractAddress = input.targetContractAddress;
        jobInput.targetFunction = input.targetFunction;
        jobInput.abi = input.abi;
      } else {
        // Safe mode - add Safe address (SDK auto-sets targetContractAddress/targetFunction/abi)
        jobInput.safeAddress = input.safeAddress;
        // Note: SDK automatically sets targetContractAddress, targetFunction, and abi for Safe Module
        // SDK uses execJobFromHub(address,address,uint256,bytes,uint8) under the hood
      }

      // Only include the relevant scheduling parameter based on the selected schedule type
      if (input.scheduleType === 'interval') {
        jobInput.timeInterval = input.timeInterval;
      } else if (input.scheduleType === 'cron') {
        jobInput.cronExpression = input.cronExpression;
      } else if (input.scheduleType === 'specific') {
        jobInput.specificSchedule = input.specificSchedule;
      }

      console.log('📦 Preparing transaction data for user signing...');

      // Create transaction preview
      const txPreview = {
        action: 'createTimeJob' as const,
        jobTitle: input.jobTitle,
        scheduleType: input.scheduleType,
        targetContract: input.targetContractAddress || 'Safe Module',
        targetFunction: input.targetFunction || 'execJobFromHub',
        chainId: input.chainId,
        walletMode: input.walletMode,
        safeAddress: input.safeAddress,
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
      console.log('📋 Transaction artifact structure:', JSON.stringify({
        txPreview,
        jobData: {
          jobInput,
          requiresUserSignature: true,
          estimatedCost: '0.01',
        },
      }, null, 2));

      console.log('🎯 Returning Task with artifacts - this should reach frontend');
      console.log('📦 Artifact name:', 'triggerx-job-plan');
      console.log('📦 Artifact data keys:', Object.keys(txArtifact));

      // Return task with transaction artifact that requires user signature
      const returnValue = {
        id: input.userAddress,
        contextId: `create-time-job-${Date.now()}`,
        kind: 'task',
        status: {
          state: 'completed' as const,
          message: {
            role: 'agent',
            messageId: `msg-${Date.now()}`,
            kind: 'message',
            parts: [{ kind: 'text', text: `Job configuration ready for ${input.walletMode} wallet mode. Please sign to create the automated job.` }],
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
       
       console.log('✅ Task artifact being returned:', JSON.stringify(returnValue, null, 2));
       return returnValue;
    } catch (error) {
      return createErrorTask('createTimeJob', error instanceof Error ? error : new Error('Unknown error occurred'));
    }
  },
};
