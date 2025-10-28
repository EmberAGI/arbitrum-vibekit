import { TriggerXClient } from 'sdk-triggerx';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

// Import tool functions
import { createTimeJob, CreateTimeJobSchema } from './tools/createTimeJob.js';
import { createEventJob, CreateEventJobSchema } from './tools/createEventJob.js';
import { createConditionJob, CreateConditionJobSchema } from './tools/createConditionJob.js';
import { getJobs, GetJobsSchema } from './tools/getJobs.js';
import { deleteJob, DeleteJobSchema } from './tools/deleteJob.js';
import { getUserDataTool, GetUserDataSchema } from './tools/getUserData.js';
import { getSafeWalletInfo, GetSafeWalletInfoSchema } from './tools/getSafeWalletInfo.js';

export async function createServer(triggerxClient: TriggerXClient) {
  const server = new McpServer({
    name: 'autosynth-mcp-server',
    version: '1.0.0'
  });

  // Register createTimeJob tool
  server.tool(
    'createTimeJob',
    'Create a time-based automated job that executes on a schedule (interval, cron, or specific time)',
    CreateTimeJobSchema.shape,
    async (params) => {
      try {
        const result = await createTimeJob(params);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        console.error(`createTimeJob: failed to create time job: ${(error as Error).message}`);
        throw new Error(`failed to create time job: ${(error as Error).message}`);
      }
    },
  );

  // Register createEventJob tool
  server.tool(
    'createEventJob',
    'Create an event-based automated job that triggers when specific blockchain events occur',
    CreateEventJobSchema.shape,
    async (params) => {
      try {
        const result = await createEventJob(params);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        console.error(`createEventJob: failed to create event job: ${(error as Error).message}`);
        throw new Error(`failed to create event job: ${(error as Error).message}`);
      }
    },
  );

  // Register createConditionJob tool
  server.tool(
    'createConditionJob',
    'Create a condition-based automated job that triggers when specified conditions are met',
    CreateConditionJobSchema.shape,
    async (params) => {
      try {
        const result = await createConditionJob(params);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        console.error(`createConditionJob: failed to create condition job: ${(error as Error).message}`);
        throw new Error(`failed to create condition job: ${(error as Error).message}`);
      }
    },
  );

  // Register getJobs tool
  server.tool(
    'getJobs',
    'Retrieve all automated jobs for the user or a specific job by ID',
    GetJobsSchema.shape,
    async (params) => {
      try {
        const result = await getJobs(params, triggerxClient);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        console.error(`getJobs: failed to retrieve jobs: ${(error as Error).message}`);
        throw new Error(`failed to retrieve jobs: ${(error as Error).message}`);
      }
    },
  );

  // Register getSafeWalletInfo tool
  server.tool(
    'getSafeWalletInfo',
    'Validate Safe wallet address format (no on-chain checks)',
    GetSafeWalletInfoSchema.shape,
    async (params) => {
      try {
        const result = await getSafeWalletInfo(params);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        console.error(`getSafeWalletInfo: failed: ${(error as Error).message}`);
        throw new Error(`failed to get safe wallet info: ${(error as Error).message}`);
      }
    },
  );

  // Register deleteJob tool
  server.tool(
    'deleteJob',
    'Delete a specific automated job by ID',
    DeleteJobSchema.shape,
    async (params) => {
      try {
        const result = await deleteJob(params, triggerxClient);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        console.error(`deleteJob: failed to delete job: ${(error as Error).message}`);
        throw new Error(`failed to delete job: ${(error as Error).message}`);
      }
    },
  );

  // Register getUserData tool
  server.tool(
    'getUserData',
    'Retrieve user statistics and job count from TriggerX platform',
    GetUserDataSchema.shape,
    async (params) => {
      try {
        const result = await getUserDataTool(params, triggerxClient);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        console.error(`getUserData: failed to retrieve user data: ${(error as Error).message}`);
        throw new Error(`failed to retrieve user data: ${(error as Error).message}`);
      }
    },
  );

  return server;
}
