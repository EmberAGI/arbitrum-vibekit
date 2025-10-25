/**
 * Get Jobs Tool
 * Retrieves all jobs or a specific job by ID
 */

import { z } from 'zod';
import type { VibkitToolDefinition } from 'arbitrum-vibekit-core';
import { createSuccessTask, createErrorTask } from 'arbitrum-vibekit-core';
import type { TriggerXContext } from '../context/types.js';
import type { JobData } from '../types.js';
import { getJobData } from 'sdk-triggerx/dist/api/getjob.js';
import { getUserData } from 'sdk-triggerx/dist/api/getUserData.js';

const GetJobsInputSchema = z.object({
  jobId: z.string().optional().describe('Specific job ID to retrieve (optional - returns all jobs if not provided)'),
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

      // Get user job data using SDK
      console.log('🚀 [getJobs] Calling SDK getJobData...');
      console.log('context.custom.triggerxClient', context.custom.triggerxClient);
      console.log('context', context);
      const result = await getJobData(context.custom.triggerxClient);
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
          const userData = await getUserData(context.custom.triggerxClient, 'demo-user'); // Note: Real user address should come from frontend
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
