/**
 * Get Jobs Tool for MCP Server
 * Retrieves all jobs or a specific job by ID
 */

import { z } from 'zod';
import { TriggerXClient } from 'sdk-triggerx';
import { getJobsByUserAddress } from 'sdk-triggerx/dist/api/getjob.js';
import { getUserData } from 'sdk-triggerx/dist/api/getUserData.js';

const ethereumAddressRegex = /^0x[a-fA-F0-9]{40}$/;

const GetJobsSchema = z.object({
  jobId: z.string().optional().describe('Specific job ID to retrieve (optional - returns all jobs if not provided)'),
  userAddress: z
    .string()
    .regex(ethereumAddressRegex)
    .optional()
    .describe('Connected wallet address (auto-detected when omitted).'),
});

export async function getJobs(params: z.infer<typeof GetJobsSchema>, triggerxClient: TriggerXClient) {
  try {
    console.log('📤 [MCP getJobs] Tool invoked');
    console.log('📝 [MCP getJobs] Input:', JSON.stringify(params, null, 2));
    
    const normalizeAddress = (value: unknown) => {
      if (typeof value !== 'string') {
        return undefined;
      }
      const trimmed = value.trim();
      return ethereumAddressRegex.test(trimmed) ? trimmed : undefined;
    };

    // Get user address from params
    let userAddress = normalizeAddress(params.userAddress);

    if (!userAddress) {
      console.error('❌ [MCP getJobs] No user address provided. userAddress parameter is required.');
      throw new Error('No connected wallet address found. Please provide userAddress parameter.');
    }

    console.log('🚀 [MCP getJobs] Calling SDK getJobsByUserAddress for address:', userAddress);
    const result = await getJobsByUserAddress(triggerxClient, userAddress);
    console.log('📦 [MCP getJobs] Raw SDK result:', JSON.stringify(result, null, 2)); 
    
    // Handle different response structures
    let jobs = {};
    if (result.success) {
      jobs = result.jobs || {};
      console.log('✅ [MCP getJobs] API call successful');
    } else {
      console.log('❌ [MCP getJobs] API call failed:', result.error);
      
      // Try getUserData as fallback to get user info and job IDs
      try {
        console.log('🔄 [MCP getJobs] Trying getUserData as fallback...');
        const userData = await getUserData(triggerxClient, userAddress);
        console.log('👤 [MCP getJobs] User data:', JSON.stringify(userData, null, 2));
        
        // Handle SDK response structure - userData is wrapped in a response object
        const actualUserData = (userData as any).data || userData;
        if (actualUserData && actualUserData.job_ids && actualUserData.job_ids.length > 0) {
          jobs = { userData: actualUserData, jobIds: actualUserData.job_ids };
          console.log('✅ [MCP getJobs] Found job IDs via getUserData:', actualUserData.job_ids);
        } else {
          jobs = { userData: actualUserData };
          console.log('ℹ️ [MCP getJobs] No job IDs found in user data');
        }
      } catch (userDataError) {
        console.log('❌ [MCP getJobs] getUserData also failed:', userDataError);
        jobs = {};
      }
    }

    console.log('📥 [MCP getJobs] Extracted jobs:', JSON.stringify(jobs, null, 2));

    const jobCount = Array.isArray(jobs) ? jobs.length : jobs ? 1 : 0;
    const message = params.jobId
      ? `Found ${jobCount} job(s) with ID: ${params.jobId}`
      : jobCount === 0 
        ? `No jobs found for this user. Create a new job to get started!`
        : `Retrieved ${jobCount} job(s) for user`;

    return {
      success: true,
      message,
      data: jobs,
    };
  } catch (error) {
    console.error('❌ [MCP getJobs] Error while retrieving jobs:', error);
    throw new Error(`Failed to retrieve jobs: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export { GetJobsSchema };
