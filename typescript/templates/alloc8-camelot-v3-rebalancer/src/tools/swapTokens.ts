import { z } from 'zod';
import type { VibkitToolDefinition } from 'arbitrum-vibekit-core';
import {
  createSuccessTask,
  createErrorTask,
  parseMcpToolResponseText,
} from 'arbitrum-vibekit-core';
import type { Task, Message } from '@google-a2a/types';
import type { RebalancerContext } from '../context/types.js';
import type { TransactionResult } from '../config/types.js';
import { SwapTokensResponseSchema } from 'ember-api';

const swapTokensParametersSchema = z.object({
  tokenIn: z.string().describe('Token to swap from (symbol or address)'),
  tokenOut: z.string().describe('Token to swap to (symbol or address)'),
  amountIn: z.string().describe('Amount of input token to swap'),
  amountOutMinimum: z
    .string()
    .optional()
    .describe('Minimum amount of output token (slippage protection)'),
  deadline: z.number().optional().describe('Transaction deadline timestamp'),
});

type SwapTokensParams = z.infer<typeof swapTokensParametersSchema>;

/**
 * Swap tokens on Camelot DEX
 */
export const swapTokensTool: VibkitToolDefinition<
  typeof swapTokensParametersSchema,
  Task | Message,
  RebalancerContext
> = {
  name: 'swapTokens',
  description: 'Swap tokens on Camelot DEX with slippage protection',
  parameters: swapTokensParametersSchema,

  execute: async (params: SwapTokensParams, context: { custom: RebalancerContext }) => {
    try {
      console.log(`🔄 Swapping ${params.amountIn} ${params.tokenIn} for ${params.tokenOut}`);

      // Get wallet address from private key
      const { getWalletAddressFromPrivateKey } = await import('../utils/walletUtils.js');
      const walletAddress = getWalletAddressFromPrivateKey(context.custom.config.walletPrivateKey);

      // Note: Ember MCP server doesn't have a direct swap tool
      // This would need to be implemented using a different approach
      throw new Error(
        'Swap functionality not available through Ember MCP server. Please use a different DEX integration.'
      );
    } catch (error) {
      console.error('❌ Error swapping tokens:', error);
      return createErrorTask(
        'swapTokens',
        error instanceof Error ? error : new Error('Failed to swap tokens: ${error}')
      );
    }
  },
};
