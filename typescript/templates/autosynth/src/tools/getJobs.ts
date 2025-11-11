/**
 * Get Jobs Tool
 * Retrieves all jobs or a specific job by ID
 */

import { z } from 'zod';
import type { VibkitToolDefinition } from 'arbitrum-vibekit-core';
import { createSuccessTask, createErrorTask } from 'arbitrum-vibekit-core';
import type { TriggerXContext } from '../context/types.js';
import type { JobData } from '../types.js';
import { getJobsByUserAddress } from 'sdk-triggerx/dist/api/getjob.js';
import { getUserData } from 'sdk-triggerx/dist/api/getUserData.js';

const ethereumAddressRegex = /^0x[a-fA-F0-9]{40}$/;

const GetJobsInputSchema = z.object({
  jobId: z
    .string()
    .optional()
    .describe('Specific job ID to retrieve (optional - returns all jobs if not provided)'),
  userAddress: z
    .string()
    .regex(ethereumAddressRegex)
    .optional()
    .describe('Connected wallet address (auto-detected when omitted).'),
});

export const getJobsTool: VibkitToolDefinition<typeof GetJobsInputSchema, any, TriggerXContext, any> = {
  name: 'getJobs',
  description: 'Retrieve all automated jobs for the user or a specific job by ID. Use this to show users their current automation jobs and their status.',
  parameters: GetJobsInputSchema,
  execute: async (input, context) => {
    try {
      console.log('📤 [getJobs] Tool invoked');
      console.log('📝 [getJobs] Input:', JSON.stringify(input, null, 2));
      console.log('🧩 [getJobs] Context summary:', {
        hasClient: !!context.custom?.triggerxClient,
        contextKeys: Object.keys(context),
        customKeys: context.custom ? Object.keys(context.custom) : 'no custom context',
      });
      // Validate context and client
      if (!context.custom?.triggerxClient) {
        console.error('❌ [getJobs] No TriggerX client available in context');
        return createErrorTask('getJobs', new Error('TriggerX client not available'));
      }

      try {
        // @ts-ignore - internal apiKey we set in provider
        console.log('🔑 [getJobs] API key present on client:', !!(context.custom.triggerxClient as any).apiKey);
      } catch (_) {}

      const normalizeAddress = (value: unknown) => {
        if (typeof value !== 'string') {
          return undefined;
        }
        const trimmed = value.trim();
        return ethereumAddressRegex.test(trimmed) ? trimmed : undefined;
      };

      // Deep search for wallet address in context
      const searchContextForAddress = (obj: any, path = 'root'): string | undefined => {
        if (!obj || typeof obj !== 'object') return undefined;
        
        // Check common address field names
        const addressFields = ['userAddress', 'walletAddress', 'connectedWalletAddress', 'address', 'userAddress', 'wallet'];
        for (const field of addressFields) {
          if (obj[field] && typeof obj[field] === 'string') {
            const normalized = normalizeAddress(obj[field]);
            if (normalized) {
              console.log(`✅ [getJobs] Found address at ${path}.${field}: ${normalized}`);
              return normalized;
            }
          }
        }
        
        // Recursively search nested objects (limit depth to avoid infinite loops)
        if (path.split('.').length < 5) {
          for (const key in obj) {
            if (key !== 'triggerxClient' && typeof obj[key] === 'object' && obj[key] !== null) {
              const found = searchContextForAddress(obj[key], `${path}.${key}`);
              if (found) return found;
            }
          }
        }
        
        return undefined;
      };

      const customContext = context.custom;
      const skillInput = (context as any).skillInput ?? {};
      const sessionContext = (context as any).session ?? {};
      const rawContext = context as any;



      // Try all known paths first - prioritize skillInput since that's where the skill passes it
      let userAddress =
        normalizeAddress(skillInput?.userAddress) ??  // Check skillInput first (from skill)
        normalizeAddress(input.userAddress) ??        // Then tool input
        normalizeAddress(skillInput?.walletAddress) ??
        normalizeAddress(skillInput?.connectedWalletAddress) ??
        normalizeAddress(skillInput?.address) ??
        normalizeAddress((customContext as any)?.userAddress) ??
        normalizeAddress((customContext as any)?.walletAddress) ??
        normalizeAddress((customContext as any)?.connectedWalletAddress) ??
        normalizeAddress(sessionContext?.walletAddress) ??
        normalizeAddress(sessionContext?.user?.walletAddress) ??
        normalizeAddress(sessionContext?.user?.address) ??
        normalizeAddress(rawContext?.walletAddress) ??
        normalizeAddress(rawContext?.userAddress) ??
        normalizeAddress(rawContext?.connectedWalletAddress);

      // If still not found, do deep search
      if (!userAddress) {
        console.log('🔍 [getJobs] Address not found in known paths, doing deep search...');
        userAddress = searchContextForAddress(context);
      }

      if (!userAddress && customContext?.signer) {
        try {
          const signerAddress = await customContext.signer.getAddress();
          userAddress = normalizeAddress(signerAddress);
        } catch (signerError) {
          console.warn('⚠️ [getJobs] Failed to resolve address from signer:', signerError);
        }
      }

      if (!userAddress) {
        console.error('❌ [getJobs] Connected wallet address not available. Ensure the wallet is connected in the UI.');
        return createErrorTask(
          'getJobs',
          new Error('No connected wallet address found. Please connect your wallet and try again.'),
        );
      }

      console.log('🚀 [getJobs] Calling SDK getJobData for address:', userAddress);
      console.log('context.custom.triggerxClient', context.custom.triggerxClient);
      const result = await getJobsByUserAddress(context.custom.triggerxClient, userAddress);
      console.log('📦 [getJobs] Raw SDK result:', JSON.stringify(result, null, 2)); 
      
      // Handle different response structures
      let jobs = {};
      if (result.success) {
        jobs = result.jobs || {};
        console.log('✅ [getJobs] API call successful');
      } else {
        console.log('❌ [getJobs] API call failed:', result.error);
        
        // Try getUserData as fallback to get user info and job IDs
        try {
          console.log('🔄 [getJobs] Trying getUserData as fallback...');
          const userData = await getUserData(context.custom.triggerxClient, userAddress);
          console.log('👤 [getJobs] User data:', JSON.stringify(userData, null, 2));
          
          // Handle SDK response structure - userData is wrapped in a response object
          const actualUserData = (userData as any).data || userData;
          if (actualUserData && actualUserData.job_ids && actualUserData.job_ids.length > 0) {
            jobs = { userData: actualUserData, jobIds: actualUserData.job_ids };
            console.log('✅ [getJobs] Found job IDs via getUserData:', actualUserData.job_ids);
          } else {
            jobs = { userData: actualUserData };
            console.log('ℹ️ [getJobs] No job IDs found in user data');
          }
        } catch (userDataError) {
          console.log('❌ [getJobs] getUserData also failed:', userDataError);
          jobs = {};
        }
      }

      console.log('📥 [getJobs] Extracted jobs:', JSON.stringify(jobs, null, 2));

      const jobCount = Array.isArray(jobs) ? jobs.length : jobs ? 1 : 0;
      const message = input.jobId
        ? `Found ${jobCount} job(s) with ID: ${input.jobId}`
        : jobCount === 0 
          ? `No jobs found for this user. Create a new job to get started!`
          : `Retrieved ${jobCount} job(s) for user`;

      return createSuccessTask('getJobs', jobs as any, message);
    } catch (error) {
      console.error('❌ [getJobs] Error while retrieving jobs:', error);
      return createErrorTask('getJobs', error instanceof Error ? error : new Error('Failed to retrieve jobs'));
    }
  },
};
