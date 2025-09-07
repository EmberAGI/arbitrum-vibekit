/**
 * Job Listing Skill
 * Simple skill dedicated to listing and viewing user jobs
 */

import { z } from 'zod';
import { defineSkill } from 'arbitrum-vibekit-core';
import { getJobsTool } from '../tools/getJobs.js';

const JobListingInputSchema = z.object({
  instruction: z.string().describe('Natural language request to list or view jobs'),
});

export const jobListingSkill = defineSkill({
  id: 'job-listing-skill',
  name: 'jobListing',
  description:
    'List and view automated jobs for the user. Use this skill when users want to see their current automation jobs, job status, or job details.',

  tags: ['automation', 'jobs', 'listing', 'view'],
  examples: [
    'Show me all my automated jobs and their current status',
    'List all my jobs',
    'What jobs do I have running?',
    'Display my automation jobs',
    'Show my current automations',
    'What automated tasks are active?',
  ],

  inputSchema: JobListingInputSchema,
  tools: [
    {
      name: 'listAllJobs',
      description: 'List all automated jobs for the user with their current status',
      parameters: z.object({}),
      execute: async (_args, context) => {
        // Delegate to getJobsTool with no jobId to get all jobs
        return await getJobsTool.execute({}, context as any);
      },
    },
    getJobsTool,
  ],

  // Let LLM orchestrate the tools based on user intent
});

