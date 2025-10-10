/**
 * Get User Data Tool for MCP Server
 * Retrieves user statistics and job count
 */

import { z } from 'zod';
import { TriggerXClient } from 'sdk-triggerx';
import { getUserData } from 'sdk-triggerx/dist/api/getUserData.js';

const GetUserDataSchema = z.object({
  userAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional().describe('User wallet address (optional - uses demo user if not provided)'),
});

export async function getUserDataTool(params: z.infer<typeof GetUserDataSchema>, triggerxClient: TriggerXClient) {
  try {
    console.error('GetUserData executing with input:', JSON.stringify(params, null, 2));
    
    const userAddress = params.userAddress || 'demo-user';
    
    // Get user data using SDK
    console.error('Calling SDK getUserData...');
    const userData = await getUserData(triggerxClient, userAddress);
    console.error('User data result:', JSON.stringify(userData, null, 2));

    return {
      success: true,
      message: `Retrieved user data for ${userAddress}`,
      data: userData,
    };
  } catch (error) {
    console.error('GetUserData error:', error);
    throw new Error(`Failed to retrieve user data: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export { GetUserDataSchema };
