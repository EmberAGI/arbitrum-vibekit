import type { VibkitToolDefinition, AgentContext } from 'arbitrum-vibekit-core';
import { parseMcpToolResponsePayload } from 'arbitrum-vibekit-core';
import type { Task, Message, DataPart, TaskState } from '@google-a2a/types/src/types.js';
import type { LendingAgentContext } from '../agent.js';
import { BorrowRepaySupplyWithdrawSchema, ZodRepayResponseSchema } from './schemas.js';
import type { LendingTransactionArtifact, LendingPreview, TokenInfo } from './types.js';
import { createTaskId, findTokenInfo } from './utils.js';

export const repayBase: VibkitToolDefinition<
  typeof BorrowRepaySupplyWithdrawSchema,
  Task | Message,
  LendingAgentContext
> = {
  description: 'Repay a borrowed token. Provide the token name and a human-readable amount.',
  parameters: BorrowRepaySupplyWithdrawSchema,
  execute: async (args, context) => {
    if (!context.mcpClients?.['ember-mcp-tool-server']) {
      throw new Error('MCP client not available');
    }

    const { tokenName: rawTokenName, amount } = args;
    const tokenName = rawTokenName.toUpperCase();

    // Find token info
    const findResult = findTokenInfo(context.custom.tokenMap, rawTokenName);

    switch (findResult.type) {
      case 'notFound':
        return {
          id: createTaskId(),
          contextId: `${rawTokenName}-not-found-${Date.now()}`,
          kind: 'task' as const,
          status: {
            state: 'failed' as TaskState,
            message: {
              role: 'agent',
              parts: [{ type: 'text', text: `Token '${rawTokenName}' not supported.` }],
            },
          },
        } as unknown as Task;

      case 'clarificationNeeded':
        const chainList = findResult.options
          .map((t: TokenInfo, idx: number) => `${idx + 1}. Chain ID: ${t.chainId}`)
          .join('\n');
        return {
          id: createTaskId(),
          contextId: `${rawTokenName}-clarification-${Date.now()}`,
          kind: 'task' as const,
          status: {
            state: 'input-required' as TaskState,
            message: {
              role: 'agent',
              parts: [
                {
                  type: 'text',
                  text: `Multiple chains found for ${rawTokenName}:\n${chainList}\nPlease specify the chain.`,
                },
              ],
            },
          },
        } as unknown as Task;

      case 'found':
        const tokenInfo = findResult.token;

        try {
          // TODO: Balance checking could be added here if needed

          const toolResult = await context.mcpClients['ember-mcp-tool-server'].callTool({
            name: 'repay',
            arguments: {
              tokenAddress: tokenInfo.address,
              tokenChainId: tokenInfo.chainId,
              amount,
              userAddress: 'placeholder', // TODO: Get from context
            },
          });

          // Parse and validate the MCP response
          const repayResp = parseMcpToolResponsePayload(toolResult, ZodRepayResponseSchema);
          const { transactions } = repayResp;

          // Build artifact
          const txPreview: LendingPreview = {
            tokenName,
            amount,
            action: 'repay',
            chainId: tokenInfo.chainId,
          };
          const artifactContent: LendingTransactionArtifact = { txPreview, txPlan: transactions };
          const dataPart: DataPart = { kind: 'data' as const, data: artifactContent as any };

          return {
            id: createTaskId(),
            contextId: `repay-${tokenName}-${Date.now()}`,
            kind: 'task' as const,
            status: {
              state: 'completed' as TaskState,
              message: {
                role: 'agent',
                parts: [
                  {
                    type: 'text',
                    text: `Repay transaction plan ready (${transactions.length} txs).`,
                  },
                ],
              },
            },
            artifacts: [{ name: 'transaction-plan', parts: [dataPart] }],
          } as unknown as Task;
        } catch (error) {
          return {
            id: createTaskId(),
            contextId: `repay-error-${Date.now()}`,
            kind: 'task' as const,
            status: {
              state: 'failed' as TaskState,
              message: {
                role: 'agent',
                parts: [{ type: 'text', text: `Repay Error: ${(error as Error).message}` }],
              },
            },
          } as unknown as Task;
        }
    }
  },
};
