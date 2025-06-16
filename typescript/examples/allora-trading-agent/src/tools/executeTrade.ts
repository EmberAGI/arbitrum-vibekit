import {
  createSuccessTask,
  createErrorTask,
  type VibkitToolDefinition,
  type AgentContext,
} from 'arbitrum-vibekit-core';
import { z } from 'zod';

const inputSchema = z.object({
  fromTokenAddress: z.string().describe('The contract address of the token to swap from.'),
  fromTokenChainId: z.string().describe('The chain ID where the fromToken contract resides.'),
  toTokenAddress: z.string().describe('The contract address of the token to swap to.'),
  toTokenChainId: z.string().describe('The chain ID where the toToken contract resides.'),
  amount: z.string().describe('The amount of the fromToken to swap (atomic, non-human readable format).'),
  userAddress: z.string().describe('The wallet address initiating the swap.'),
});

export const executeTradeTool: VibkitToolDefinition<typeof inputSchema> = {
  name: 'executeTrade',
  description: 'Executes a token swap via the Ember AI on-chain actions.',
  parameters: inputSchema,
  execute: async (args, context: AgentContext) => {
    console.log(`Executing trade for user: ${args.userAddress}`);

    const emberMcpClient = context.mcpClients?.['ember-mcp-tool-server'];

    if (!emberMcpClient) {
      return createErrorTask(
        'mcp-client-missing',
        new Error("The Ember MCP client is not available in the tool's context."),
      );
    }

    const tradeResult = await emberMcpClient.callTool({
      name: 'swapTokens',
      arguments: args,
    });

    console.log('Received trade result:', tradeResult);

    return createSuccessTask('trade-executed', [
      {
        type: 'application/json',
        content: JSON.stringify(tradeResult, null, 2),
        name: 'trade_receipt.json',
      },
    ]);
  },
};
