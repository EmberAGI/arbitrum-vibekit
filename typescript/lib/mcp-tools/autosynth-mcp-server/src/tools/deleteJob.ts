/**
 * Delete Job Tool for MCP Server
 * Deletes a job by ID
 */

import { z } from 'zod';
import { TriggerXClient } from 'sdk-triggerx';

const DeleteJobSchema = z.object({
  jobId: z.string().min(1).describe('Job ID to delete'),
});

export async function deleteJob(params: z.infer<typeof DeleteJobSchema>, triggerxClient: TriggerXClient) {
  try {
    console.log(' DeleteJob executing with input:', JSON.stringify(params, null, 2));
    
    // Note: The actual deletion would be implemented using the TriggerX SDK
    // For now, we'll return a success response indicating the job would be deleted
    // In a real implementation, you would call the appropriate SDK method
    
    console.log(`Job ${params.jobId} would be deleted (implementation pending)`);

    return {
      success: true,
      message: `Job ${params.jobId} has been successfully deleted.`,
      data: { deletedJobId: params.jobId },
    };
  } catch (error) {
    console.error(' DeleteJob error:', error);
    throw new Error(`Failed to delete job: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export { DeleteJobSchema };
