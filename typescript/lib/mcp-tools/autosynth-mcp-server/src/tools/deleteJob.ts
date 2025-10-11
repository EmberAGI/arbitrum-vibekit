/**
 * Delete Job Tool for MCP Server
 * Performs on-chain deletion + API update using SDK (requires server signer)
 */

import { z } from 'zod';
import { TriggerXClient } from 'sdk-triggerx';
import { deleteJob as deleteJobSDK } from 'sdk-triggerx/dist/api/deleteJob.js';
import { ethers } from 'ethers';

const DeleteJobSchema = z.object({
  jobId: z.string().min(1).describe('Job ID to delete'),
  chainId: z.string().default('421614').describe('Target blockchain chain ID (Arbitrum Sepolia)'),
});

export async function deleteJob(params: z.infer<typeof DeleteJobSchema>, triggerxClient: TriggerXClient) {
  try {
    console.log('🗑️ [MCP] DeleteJob executing with input:', JSON.stringify(params, null, 2));

    const rpcUrl = process.env.RPC_URL;
    const privateKey = process.env.PRIVATE_KEY;
    if (!rpcUrl || !privateKey) {
      throw new Error('RPC_URL and PRIVATE_KEY must be configured in environment to delete jobs on-chain');
    }

    // Create signer from server credentials
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const signer = new ethers.Wallet(privateKey, provider);

    // Call SDK deleteJob with signer and chainId
    // Support older SDK typings during transition by casting to any
    await (deleteJobSDK as any)(triggerxClient, params.jobId, signer, params.chainId);

    console.log(`✅ [MCP] Job ${params.jobId} deleted successfully on chain ${params.chainId}`);

    return {
      success: true,
      message: `Job ${params.jobId} has been deleted on-chain and updated via API`,
      data: { deletedJobId: params.jobId, chainId: params.chainId },
    };
  } catch (error) {
    console.error('❌ [MCP] DeleteJob error:', error);
    throw new Error(`Failed to delete job: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export { DeleteJobSchema };
