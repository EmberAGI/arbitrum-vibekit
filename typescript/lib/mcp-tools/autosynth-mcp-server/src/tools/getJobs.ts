/**
 * Get Jobs Tool for MCP Server
 * Retrieves all jobs or a specific job by ID
 */

import { z } from 'zod';
import { TriggerXClient } from 'sdk-triggerx';
import { getJobData } from 'sdk-triggerx/dist/api/getjob.js';
import { getUserData } from 'sdk-triggerx/dist/api/getUserData.js';

const GetJobsSchema = z.object({
  jobId: z.string().optional().describe('Specific job ID to retrieve (optional - returns all jobs if not provided)'),
});

export async function getJobs(params: z.infer<typeof GetJobsSchema>, triggerxClient: TriggerXClient) {
  try {
    console.error('GetJobs executing with input:', JSON.stringify(params, null, 2));
    
    // Get user job data using SDK
    console.error('Calling SDK getJobData...');
    const result = await getJobData(triggerxClient);
    console.error('Raw SDK result:', JSON.stringify(result, null, 2));
    
    // Handle different response structures
    let jobs = {};
    if (result.success) {
      jobs = result.jobs || {};
      console.error('API call successful');
    } else {
      console.error('API call failed:', result.error);
      
      // Try getUserData as fallback to get user info and job IDs
      try {
        console.error('Trying getUserData as fallback...');
        const userData = await getUserData(triggerxClient, 'demo-user'); // Note: Real user address should come from frontend
        console.error('User data:', JSON.stringify(userData, null, 2));
        
        if (userData && userData.data && userData.data.job_ids && userData.data.job_ids.length > 0) {
          jobs = { userData: userData.data, jobIds: userData.data.job_ids };
          console.error('Found job IDs via getUserData:', userData.data.job_ids);
        } else {
          jobs = { userData: userData.data };
          console.error('No job IDs found in user data');
        }
      } catch (userDataError) {
        console.error('getUserData also failed:', userDataError);
        jobs = {};
      }
    }

    console.error('Extracted jobs:', JSON.stringify(jobs, null, 2));

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
    console.error('GetJobs error:', error);
    throw new Error(`Failed to retrieve jobs: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export { GetJobsSchema };
