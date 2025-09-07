/**
 * Delete Job Tool
 * Deletes a specific job by ID
 */

import { z } from 'zod';
import type { VibkitToolDefinition } from 'arbitrum-vibekit-core';
import { createSuccessTask, createErrorTask } from 'arbitrum-vibekit-core';
import type { TriggerXClient } from 'sdk-triggerx';
import { deleteJob } from 'sdk-triggerx/dist/api/deleteJob.js';
import type { TriggerXContext } from '../context/types.js';

const DeleteJobInputSchema = z.object({
  jobId: z.string().min(1).describe('ID of the job to delete'),
});


export const deleteJobTool: VibkitToolDefinition<typeof DeleteJobInputSchema, any, TriggerXContext, any> = {
  name: 'deleteJob',
  description: 'Delete a scheduled job by its ID',
  parameters: DeleteJobInputSchema,
  execute: async (input, context) => {
    try {
      console.log('🗑️ Attempting to delete job:', input.jobId);

      // Use the SDK-style deleteJob function
      await deleteJob(context.custom.triggerxClient, input.jobId);

      console.log('✅ Job deleted successfully:', input.jobId);

      return createSuccessTask(
        'deleteJob',
        undefined,
        `Job ${input.jobId} has been successfully deleted`
      );
    } catch (error) {
      console.error('❌ Error deleting job:', error);
      return createErrorTask('deleteJob', error instanceof Error ? error : new Error('Failed to delete job'));
    }
  },
};
