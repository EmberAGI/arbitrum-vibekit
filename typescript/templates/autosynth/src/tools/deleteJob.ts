/**
 * Delete Job Tool
 * Deletes a specific job by ID
 */

import { z } from 'zod';
import type { VibkitToolDefinition } from 'arbitrum-vibekit-core';
import { createErrorTask } from 'arbitrum-vibekit-core';
import type { TriggerXContext } from '../context/types.js';
import type { Task } from '@google-a2a/types';

const DeleteJobInputSchema = z.object({
  jobId: z.string().min(1).describe('ID of the job to delete'),
  chainId: z.string().default('421614').describe('Target blockchain chain ID (defaults to Arbitrum Sepolia 421614)'),
  userAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional().describe('User wallet address (for task id)'),
});


export const deleteJobTool: VibkitToolDefinition<typeof DeleteJobInputSchema, any, TriggerXContext, any> = {
  name: 'deleteJob',
  description: 'Delete a scheduled job by its ID',
  parameters: DeleteJobInputSchema,
  execute: async (input) => {
    try {
      console.log('🗑️ Preparing delete job transaction plan for:', input.jobId);

      const txPreview = {
        action: 'deleteJob' as const,
        jobId: input.jobId,
        chainId: input.chainId || '421614',
      };

      const txArtifact = {
        txPreview,
        jobData: {
          jobId: input.jobId,
          chainId: input.chainId || '421614',
          requiresUserSignature: true,
        },
      };

      const task: Task = {
        id: input.userAddress || `delete-${input.jobId}`,
        contextId: `delete-job-${Date.now()}`,
        kind: 'task',
        status: {
          state: 'completed',
          message: {
            role: 'agent',
            messageId: `msg-${Date.now()}`,
            kind: 'message',
            parts: [{ kind: 'text', text: 'Delete job ready. Please sign to confirm deletion.' }],
          },
        },
        artifacts: [
          {
            artifactId: `triggerx-delete-${Date.now()}`,
            name: 'triggerx-delete-plan',
            parts: [{ kind: 'data', data: txArtifact }],
          },
        ],
      } as Task;

      return task;
    } catch (error) {
      console.error('❌ Error deleting job:', error);
      return createErrorTask('deleteJob', error instanceof Error ? error : new Error('Failed to delete job'));
    }
  },
};
